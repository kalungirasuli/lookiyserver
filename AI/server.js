const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { IndexFlatIP } = require('faiss-node');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '8003');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const ai = new GoogleGenAI({});

// Initialize database connection
const sql = postgres({
    host: 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    username: process.env.POSTGRES_USERNAME || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'supersecretpassword',
    database: 'lookiy'
});

// FAISS indices and mappings
/** @type {any} */
let userIndex = null;
/** @type {any} */
let networkIndex = null;
/** @type {Object.<string, any>} */
const userMapping = {};
/** @type {Object.<string, any>} */
const networkMapping = {};
/** @type {number} */
let nextUserId = 1;
/** @type {number} */
let nextNetworkId = 1;

// Initialize FAISS indices
function initializeIndices() {
    try {
        userIndex = new IndexFlatIP(768); // 768 dimensions for Gemini embeddings
        networkIndex = new IndexFlatIP(768);
        
        console.log('FAISS indices initialized successfully');
    } catch (error) {
        console.error('Error initializing FAISS indices:', error);
    }
}

// Generate embedding using Gemini
/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
    try {
        const response = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: [text]
        });
        
        if (!response.embeddings || !response.embeddings[0]) {
            throw new Error('No embeddings returned from API');
        }
        
        const embedding = response.embeddings[0].values;
        
        if (!embedding) {
            throw new Error('No embedding values returned');
        }
        
        // Normalize the embedding
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => val / norm);
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

// Fetch users from database
/**
 * @returns {Promise<any[]>}
 */
async function fetchUsersFromDatabase() {
    try {
        const users = await sql`
            SELECT id, name, email, description, interests
            FROM users 
            WHERE account_status = 'active'
            LIMIT 100
        `;
        return users;
    } catch (error) {
        console.error('Error fetching users from database:', error);
        return [];
    }
}

// Create profile text from user data
/**
 * @param {any} profile
 * @returns {string}
 */
function createProfileText(profile) {
    const parts = [];
    if (profile.name) parts.push(profile.name);
    if (profile.bio) parts.push(profile.bio);
    if (profile.interests && Array.isArray(profile.interests)) {
        parts.push(profile.interests.join(' '));
    }
    if (profile.skills && Array.isArray(profile.skills)) {
        parts.push(profile.skills.join(' '));
    }
    if (profile.location) parts.push(profile.location);
    if (profile.profession) parts.push(profile.profession);
    
    return parts.join(' '); // Use space separator for better embeddings
}

// Enhanced compatibility score calculation
/**
 * @param {number} similarity
 * @param {any} profile1
 * @param {any} profile2
 * @returns {number}
 */
function calculateEnhancedScore(similarity, profile1, profile2) {
    let enhancedScore = similarity;
    
    // Boost score for matching interests
    if (profile1.interests && profile2.interests) {
        const interests1 = Array.isArray(profile1.interests) ? profile1.interests : [];
        const interests2 = Array.isArray(profile2.interests) ? profile2.interests : [];
        const commonInterests = interests1.filter((/** @type {any} */ interest) => 
            interests2.includes(interest)
        ).length;
        enhancedScore += commonInterests * 0.1;
    }
    
    // Boost score for matching skills
    if (profile1.skills && profile2.skills) {
        const skills1 = Array.isArray(profile1.skills) ? profile1.skills : [];
        const skills2 = Array.isArray(profile2.skills) ? profile2.skills : [];
        const commonSkills = skills1.filter((/** @type {any} */ skill) => 
            skills2.includes(skill)
        ).length;
        enhancedScore += commonSkills * 0.15;
    }
    
    // Boost score for same location
    if (profile1.location && profile2.location && 
        profile1.location.toLowerCase() === profile2.location.toLowerCase()) {
        enhancedScore += 0.2;
    }
    
    return Math.min(enhancedScore, 1.0); // Cap at 1.0
}

// Load indices from disk
/**
 * @returns {Promise<void>}
 */
async function loadIndices() {
    try {
        const userMappingPath = path.join(__dirname, 'user_mapping.json');
        const networkMappingPath = path.join(__dirname, 'network_mapping.json');
        const userIndexPath = path.join(__dirname, 'user_index.faiss');
        const networkIndexPath = path.join(__dirname, 'network_index.faiss');
        
        // Load mapping files
        if (fs.existsSync(userMappingPath)) {
            const mappingData = JSON.parse(await fs.promises.readFile(userMappingPath, 'utf8'));
            Object.assign(userMapping, mappingData);
            const userIds = Object.keys(mappingData).map(Number).filter(id => !isNaN(id));
            nextUserId = userIds.length > 0 ? Math.max(...userIds) + 1 : 1;
            console.log(`Loaded user mapping with ${Object.keys(mappingData).length} entries`);
        }
        
        if (fs.existsSync(networkMappingPath)) {
            const mappingData = JSON.parse(await fs.promises.readFile(networkMappingPath, 'utf8'));
            Object.assign(networkMapping, mappingData);
            const networkIds = Object.keys(mappingData).map(Number).filter(id => !isNaN(id));
            nextNetworkId = networkIds.length > 0 ? Math.max(...networkIds) + 1 : 1;
            console.log(`Loaded network mapping with ${Object.keys(mappingData).length} entries`);
        }
        
        // Load FAISS indices if they exist
        if (fs.existsSync(userIndexPath)) {
            userIndex = IndexFlatIP.read(userIndexPath);
            console.log('User FAISS index loaded from:', userIndexPath);
        }
        
        if (fs.existsSync(networkIndexPath)) {
            networkIndex = IndexFlatIP.read(networkIndexPath);
            console.log('Network FAISS index loaded from:', networkIndexPath);
        }
        
    } catch (error) {
        console.error('Error loading indices:', error);
    }
}

// Save indices to disk
/**
 * @returns {Promise<boolean>}
 */
async function saveIndices() {
    try {
        const userMappingPath = path.join(__dirname, 'user_mapping.json');
        const networkMappingPath = path.join(__dirname, 'network_mapping.json');
        const userIndexPath = path.join(__dirname, 'user_index.faiss');
        const networkIndexPath = path.join(__dirname, 'network_index.faiss');
        
        // Save mapping files
        await fs.promises.writeFile(userMappingPath, JSON.stringify(userMapping, null, 2));
        await fs.promises.writeFile(networkMappingPath, JSON.stringify(networkMapping, null, 2));
        
        // Save FAISS indices if they exist
        if (userIndex) {
            await userIndex.write(userIndexPath);
            console.log('User FAISS index saved to:', userIndexPath);
        }
        if (networkIndex) {
            await networkIndex.write(networkIndexPath);
            console.log('Network FAISS index saved to:', networkIndexPath);
        }
        
        console.log('Indices and mappings saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving indices:', error);
        return false;
    }
}

// Populate users from database
/**
 * @returns {Promise<number>}
 */
async function populateUsersFromDatabase() {
    try {
        console.log('Fetching users from database...');
        const users = await fetchUsersFromDatabase();
        console.log(`Found ${users.length} users in database`);
        
        let addedCount = 0;
        for (const user of users) {
            try {
                const profileText = createProfileText({
                    name: user.name,
                    email: user.email,
                    description: user.description || '',
                    interests: user.interests || []
                });
                
                const embedding = await generateEmbedding(profileText);
                const embeddingArray = Array.from(embedding);
                userIndex.add(embeddingArray);
                
                const userId = nextUserId++;
                userMapping[userId.toString()] = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    description: user.description,
                    interests: user.interests,
                    profileText,
                    addedAt: new Date().toISOString()
                };
                
                addedCount++;
                console.log(`Added user ${user.name} (${user.id}) with internal ID ${userId}`);
            } catch (error) {
                console.error(`Error adding user ${user.name}:`, error);
            }
        }
        
        console.log(`Successfully added ${addedCount} users to FAISS index`);
        return addedCount;
    } catch (error) {
        console.error('Error populating users from database:', error);
        return 0;
    }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        userCount: Object.keys(userMapping).length,
        networkCount: Object.keys(networkMapping).length
    });
});

// Populate users from database
app.post('/populate_users', async (req, res) => {
    try {
        const addedCount = await populateUsersFromDatabase();
        res.json({ 
            success: true, 
            message: `Added ${addedCount} users from database`,
            userCount: Object.keys(userMapping).length
        });
    } catch (error) {
        console.error('Error populating users:', error);
        res.status(500).json({ error: 'Failed to populate users from database' });
    }
});

// Add user to FAISS index
app.post('/add_user', async (req, res) => {
    try {
        const userData = req.body;
        
        if (!userData.name) {
            return res.status(400).json({ error: 'User name is required' });
        }
        
        const profileText = createProfileText(userData);
        const embedding = await generateEmbedding(profileText);
        
        // Add to FAISS index
        const userId = nextUserId++;
        // Convert embedding to regular array for FAISS
        const embeddingArray = Array.from(embedding);
        userIndex.add(embeddingArray);
        
        // Store mapping
        userMapping[userId.toString()] = {
            ...userData,
            profileText,
            addedAt: new Date().toISOString()
        };
        
        console.log(`Added user ${userData.name} with ID ${userId}`);
        
        res.json({ 
            success: true, 
            userId, 
            message: `User ${userData.name} added successfully` 
        });
        
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Failed to add user' });
    }
});

// Get user recommendations
app.post('/recommend', async (req, res) => {
    try {
        const { query, userId, limit = 5 } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        // Generate embedding for query
        const queryEmbedding = await generateEmbedding(query);
        
        // Search FAISS index
        const queryArray = Array.from(queryEmbedding);
        const k = Math.max(1, Math.min(limit + 1, userIndex.ntotal())); // Ensure k > 0
        const results = userIndex.search(queryArray, k);
        console.log("Faiss : " ,results)
        
        const recommendations = [];
        const queryUserProfile = userId ? userMapping[userId.toString()] : null;
        
        for (let i = 0; i < results.labels.length; i++) {
            const resultUserId = results.labels[i] + 1; // FAISS uses 0-based indexing
            const similarity = results.distances[i];
            
            // Skip if this is the querying user
            if (userId && resultUserId === parseInt(userId)) {
                continue;
            }
            
            const userProfile = userMapping[resultUserId.toString()];
            if (userProfile) {
                let score = similarity;
                
                // Calculate enhanced score if we have the querying user's profile
                if (queryUserProfile) {
                    score = calculateEnhancedScore(similarity, queryUserProfile, userProfile);
                }
                
                recommendations.push({
                    userId: resultUserId,
                    profile: userProfile,
                    similarity: similarity,
                    enhancedScore: score
                });
            }
            
            if (recommendations.length >= limit) break;
        }
        
        res.json({ 
            query,
            recommendations: recommendations.slice(0, limit)
        });
        
    } catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});

// FAISS-based recommendations endpoint for specific user
app.post('/recommendations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const top_n = typeof req.query.top_n === 'string' ? parseInt(req.query.top_n) : 10;
        const network_filter = typeof req.query.network_filter === 'string' ? req.query.network_filter : undefined;
        
        if (!userIndex || userIndex.ntotal() === 0) {
            return res.status(400).json({ error: 'No users in index. Please populate users first.' });
        }
        
        // Get the target user's profile
        const users = await fetchUsersFromDatabase();
        const targetUser = users.find(u => u.id.toString() === userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Generate embedding for the target user's profile
        const profileText = createProfileText({
            name: targetUser.name,
            email: targetUser.email,
            description: targetUser.description || '',
            interests: targetUser.interests || []
        });
        const userEmbedding = await generateEmbedding(profileText);
        if (!userEmbedding) {
            return res.status(500).json({ error: 'Failed to generate embedding for user profile' });
        }
        
        // Search for similar users
        const k = Math.max(1, Math.min(top_n + 1, userIndex.ntotal())); // Ensure k > 0, +1 to exclude self
        
        if (k <= 0) {
            console.error(`Error: k is ${k}, this should not happen`);
            return res.status(500).json({ error: 'Invalid search parameter' });
        }
        
        const queryArray = Array.from(userEmbedding);
        const results = userIndex.search(queryArray, k);
        
        const recommendations = [];
        for (let i = 0; i < results.labels.length; i++) {
            const resultUserId = results.labels[i] + 1; // FAISS uses 0-based indexing
            const similarity = results.distances[i];
            
            // Skip if this is the querying user
            if (resultUserId === parseInt(userId)) {
                continue;
            }
            
            const candidateProfile = userMapping[resultUserId.toString()];
            if (candidateProfile) {
                // Apply network filter if specified
                if (network_filter && candidateProfile.network_id !== parseInt(network_filter)) {
                    continue;
                }
                
                const enhancedScore = calculateEnhancedScore(similarity, {
                    name: targetUser.name,
                    interests: targetUser.interests || [],
                    skills: targetUser.skills || [],
                    location: targetUser.location,
                    profession: targetUser.profession
                }, candidateProfile);
                
                recommendations.push({
                    userId: resultUserId,
                    profile: candidateProfile,
                    similarity: similarity,
                    enhancedScore: enhancedScore,
                    explanation: `Matched based on similar interests and skills with ${(similarity * 100).toFixed(1)}% similarity`
                });
            }
        }
        
        // Sort by enhanced score and limit results
        recommendations.sort((a, b) => b.enhancedScore - a.enhancedScore);
        const limitedRecommendations = recommendations.slice(0, top_n);
        
        res.json({
            userId: parseInt(userId),
            recommendations: limitedRecommendations,
            total: limitedRecommendations.length,
            network_filter: network_filter || null
        });
        
    } catch (error) {
        console.error('Error generating FAISS recommendations:', error);
        res.status(500).json({ error: 'Failed to generate recommendations' });
    }
});

// Save indices endpoint
app.post('/save_indices', async (req, res) => {
    try {
        const success = await saveIndices();
        if (success) {
            res.json({ message: 'Indices saved successfully' });
        } else {
            res.status(500).json({ error: 'Failed to save indices' });
        }
    } catch (error) {
        console.error('Error saving indices:', error);
        res.status(500).json({ error: 'Failed to save indices' });
    }
});

// Get all users
app.get('/users', (req, res) => {
    res.json({ users: userMapping });
});

// Delete user
app.delete('/users/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (userMapping[userId.toString()]) {
            delete userMapping[userId.toString()];
            // Note: FAISS doesn't support individual deletion, would need to rebuild index
            res.json({ message: `User ${userId} deleted from mapping` });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Initialize and start server
/**
 * @returns {Promise<void>}
 */
async function startServer() {
    try {
        initializeIndices();
        await loadIndices();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`AI Recommendation Service running on http://0.0.0.0:${PORT}`);
            console.log(`Users loaded: ${Object.keys(userMapping).length}`);
            console.log(`Networks loaded: ${Object.keys(networkMapping).length}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await saveIndices();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await saveIndices();
    process.exit(0);
});

module.exports = app;