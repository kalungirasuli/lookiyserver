const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const bodyParser = require('body-parser');
const { url } = require('inspector');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '8003');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded())

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize database connection
const sql = postgres({
    host: 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    username: process.env.POSTGRES_USERNAME || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'supersecretpassword',
    database: 'lookiy'
});

// Qdrant client and collections
/** @type {import('@qdrant/js-client-rest').QdrantClient|null} */
let qdrantClient = null;
/** @type {Object.<string, any>} */
const userMapping = {};
/** @type {Object.<string, any>} */
const networkMapping = {};
/** @type {number} */
let nextUserId = 1;
/** @type {number} */
let nextNetworkId = 1;

/**
 * @typedef {Object} UserProfile
 * @property {string} name
 * @property {string} [email]
 * @property {string} [description]
 * @property {string[]} [interests]
 * @property {string[]} [skills]
 * @property {string} [profession]
 * @property {string} [location]
 * @property {string} [profileText]
 * @property {string} [addedAt]
 */

/**
 * @typedef {Object} SearchParams
 * @property {number[]} vector
 * @property {number} limit
 * @property {boolean} with_payload
 * @property {boolean} with_vectors
 * @property {Object} [filter]
 */

// Initialize Qdrant client and collections
/**
 * @returns {Promise<boolean>}
 */
async function initializeIndices() {
    try {
        // Create Qdrant client with retry logic
        const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        console.log(`Connecting to Qdrant at ${qdrantUrl}`);
        
        qdrantClient = new QdrantClient({
            url: qdrantUrl,
            timeout: 5000 // 5 second timeout
        });
        
        // Check if Qdrant is running
        try {
            await qdrantClient.getCollections();
            console.log('Successfully connected to Qdrant server');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Cannot connect to Qdrant server. Is it running?', errorMessage);
            console.log('Continuing without vector search capabilities. Some features will be limited.');
            return false;
        }
        
        // Create collections if they don't exist
        await createCollectionIfNotExists('users', 3072); // 3072 dimensions for Gemini embeddings
        await createCollectionIfNotExists('networks', 3072);
        
        console.log('Qdrant collections initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing Qdrant collections:', error);
        console.log('Continuing without vector search capabilities. Some features will be limited.');
        return false;
    }
}

// Helper function to create a collection if it doesn't exist
/**
 * Creates a Qdrant collection if it doesn't exist
 * @param {string} collectionName - Name of the collection to create
 * @param {number} vectorSize - Vector dimension
 * @returns {Promise<boolean>} - Whether the collection exists or was created successfully
 */
async function createCollectionIfNotExists(collectionName, vectorSize) {
    try {
        if (!qdrantClient) {
            console.error('Qdrant client is not initialized');
            return false;
        }
        
        const collections = await qdrantClient.getCollections();
        const collectionExists = collections.collections.some((c) => c.name === collectionName);
        
        if (!collectionExists) {
            await qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: vectorSize,
                    distance: 'Cosine'
                }
            });
            console.log(`Created ${collectionName} collection`);
        } else {
            console.log(`Collection ${collectionName} already exists`);
        }
        return true;
    } catch (error) {
        console.error(`Error creating ${collectionName} collection:`, error instanceof Error ? error.message : String(error));
        return false;
    }
}

// Generate embedding using Gemini
/**
 * Generates an embedding vector for the given text
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]|null>} - Embedding vector or null if error
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
        const norm = Math.sqrt(embedding.reduce(function(sum, val) { return sum + val * val; }, 0));
        return embedding.map(function(val) { return val / norm; });
    } catch (error) {
        console.error('Error generating embedding:', error instanceof Error ? error.message : String(error));
        return null;
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

// Extract skills from description and interests
/**
 * @param {string} description - User description
 * @param {string[]} interests - User interests
 * @returns {Promise<string[]>} - Extracted skills
 */
async function extractSkills(description = '', interests = []) {
    // First try to use Gemini to extract skills
    try {
        const text = description + '\n\nInterests: ' + interests.join(', ');
        
        // Use Gemini to extract skills
        const prompt = `Extract professional skills from the following user bio. 
        Return ONLY a comma-separated list of specific technical and professional skills. 
        Do not include general traits, soft skills, or personal qualities unless they are industry-recognized skills.
        Focus on extracting concrete, specific skills that would appear on a professional resume or LinkedIn profile.
        
        User Bio: ${text}`;
        console.log("loading data to gemini")
        const result = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                systemInstruction: "You are a professional skills extractor. Extract only specific technical and professional skills from text."
            }
        });
        const responseText =result.text;
        console.log("RESPONSE FORM GEMINI",responseText)
        if (responseText) {
            // Parse the comma-separated list
            const skills = responseText.split(',').map(skill => skill.trim().toLowerCase())
                .filter(skill => skill.length > 0);
            
            if (skills.length > 0) {
                console.log('Skills extracted using Gemini:', skills);
                return skills;
            }
        }
        
        throw new Error('No valid skills extracted from Gemini response');
    } catch (error) {
        console.log(error)
        console.warn('Error extracting skills with Gemini, falling back to keyword matching:', 
            error instanceof Error ? error.message : String(error));
        
        // Fall back to keyword matching if Gemini fails
        const skillKeywords = [
            'programming', 'developer', 'software', 'engineer', 'coding', 'code',
            'javascript', 'python', 'java', 'c++', 'ruby', 'php', 'html', 'css', 'react', 'angular', 'vue',
            'node', 'express', 'django', 'flask', 'spring', 'laravel', 'rails',
            'aws', 'azure', 'gcp', 'cloud', 'devops', 'docker', 'kubernetes', 'ci/cd',
            'database', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'oracle',
            'machine learning', 'ml', 'ai', 'artificial intelligence', 'data science', 'analytics',
            'blockchain', 'crypto', 'web3', 'nft', 'smart contract', 'ethereum', 'bitcoin',
            'mobile', 'ios', 'android', 'flutter', 'react native',
            'ux', 'ui', 'user experience', 'user interface', 'design', 'graphic',
            'marketing', 'seo', 'content', 'social media', 'advertising',
            'sales', 'business development', 'negotiation', 'client',
            'project management', 'agile', 'scrum', 'kanban', 'leadership',
            'finance', 'accounting', 'investment', 'trading', 'economics',
            'legal', 'compliance', 'regulatory', 'law',
            'healthcare', 'medical', 'clinical', 'patient',
            'education', 'teaching', 'training', 'coaching',
            'research', 'analysis', 'statistics', 'data',
            'writing', 'editing', 'content creation', 'blogging',
            'language', 'translation', 'multilingual',
            'agriculture', 'farming', 'sustainable', 'organic',
            'manufacturing', 'production', 'supply chain', 'logistics'
        ];
        
        const extractedSkills = new Set();
        const text = (description + ' ' + interests.join(' ')).toLowerCase();
        
        // Extract skills based on keywords
        skillKeywords.forEach(skill => {
            if (text.includes(skill.toLowerCase())) {
                extractedSkills.add(skill);
            }
        });
        
        // Extract skills that might be mentioned as "skilled in X" or "expertise in X"
        const skillPhrases = text.match(/(?:skill(?:ed)?|expert(?:ise)?|proficient|experience)\s+(?:in|with)\s+([\w\s,]+)/gi) || [];
        skillPhrases.forEach(phrase => {
            const skillPart = phrase.split(/(?:in|with)\s+/)[1];
            if (skillPart) {
                skillPart.split(/[,\s]+/).forEach(s => {
                    if (s.length > 2) extractedSkills.add(s.trim());
                });
            }
        });
        
        return Array.from(extractedSkills);
    }
}

// Extract profession from description and interests
/**
 * @param {string} description - User description
 * @param {string[]} interests - User interests
 * @returns {Promise<string>} - Extracted profession
 */
async function extractProfession(description = '', interests = []) {
    // First try to use Gemini to extract profession
    try {
        const text = description + '\n\nInterests: ' + interests.join(', ');
        
        // Use Gemini to extract profession
        const prompt = `Extract the most likely professional title or job role from the following user bio.
        Return ONLY a single, specific job title or professional role (e.g., "Software Engineer", "Marketing Manager", "Data Scientist").
        Do not include explanations, bullet points, or any other text.
        
        User Bio: ${text}`;
        
        const result = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                systemInstruction: "You are a professional title extractor. Extract only the most likely job title from text."
            }
        });
        const responseText = (result.response?.text || result.text || "").trim();
        
        if (responseText && responseText.length > 0) {
            console.log('Profession extracted using Gemini:', responseText);
            return responseText.toLowerCase();
        }
        
        throw new Error('No valid profession extracted from Gemini response');
    } catch (error) {
        console.warn('Error extracting profession with Gemini, falling back to keyword matching:', 
            error instanceof Error ? error.message : String(error));
        
        // Fall back to keyword matching if Gemini fails
        const professionKeywords = {
            'software engineer': ['software engineer', 'software developer', 'programmer', 'coder', 'web developer'],
            'data scientist': ['data scientist', 'data analyst', 'machine learning', 'ai researcher'],
            'product manager': ['product manager', 'product owner', 'product lead'],
            'designer': ['designer', 'ux designer', 'ui designer', 'graphic designer'],
            'marketing specialist': ['marketing', 'digital marketing', 'seo specialist', 'content marketer'],
            'business analyst': ['business analyst', 'business intelligence', 'data analyst'],
            'project manager': ['project manager', 'program manager', 'scrum master', 'agile coach'],
            'entrepreneur': ['entrepreneur', 'founder', 'co-founder', 'startup', 'business owner'],
            'consultant': ['consultant', 'advisor', 'strategist'],
            'researcher': ['researcher', 'scientist', 'phd', 'academic'],
            'teacher': ['teacher', 'professor', 'instructor', 'educator', 'lecturer'],
            'writer': ['writer', 'author', 'content creator', 'blogger', 'journalist'],
            'healthcare professional': ['doctor', 'nurse', 'physician', 'healthcare', 'medical'],
            'legal professional': ['lawyer', 'attorney', 'legal', 'paralegal', 'counsel'],
            'finance professional': ['finance', 'accountant', 'financial analyst', 'investment', 'banking'],
            'sales professional': ['sales', 'account executive', 'business development'],
            'human resources': ['hr', 'human resources', 'talent acquisition', 'recruiter'],
            'executive': ['ceo', 'cto', 'cfo', 'coo', 'chief', 'executive', 'director', 'vp', 'head of'],
            'student': ['student', 'studying', 'university', 'college', 'school', 'graduate'],
            'artist': ['artist', 'musician', 'painter', 'sculptor', 'creative'],
            'engineer': ['engineer', 'engineering', 'mechanical', 'electrical', 'civil'],
            'farmer': ['farmer', 'agriculture', 'farming', 'grower', 'rancher']
        };
        
        const text = (description + ' ' + interests.join(' ')).toLowerCase();
        
        // Check for explicit profession statements
        const professionMatch = text.match(/(?:i am|i'm|working as|employed as|profession is|career as)\s+(?:an?|the)?\s+([\w\s]+)/i);
        if (professionMatch && professionMatch[1]) {
            return professionMatch[1].trim();
        }
        
        // Check for profession keywords
        for (const [profession, keywords] of Object.entries(professionKeywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword.toLowerCase())) {
                    return profession;
                }
            }
        }
        
        return 'professional'; // Default if no profession detected
    }
}

// Create enhanced profile text from user data
/**
 * @param {any} profile
 * @returns {Promise<string>}
 */
async function createProfileText(profile) {
    // Extract skills and profession if not already provided
    const skills = profile.skills || await extractSkills(profile.description || '', profile.interests || []);
    const profession = profile.profession || await extractProfession(profile.description || '', profile.interests || []);
    
    // Create structured profile text
    return `Name: ${profile.name || 'Unknown'}

Profession: ${profession}

Bio: ${profile.description || ''}

Interests: ${Array.isArray(profile.interests) ? profile.interests.join(', ') : ''}

Skills: ${Array.isArray(skills) ? skills.join(', ') : ''}

Location: ${profile.location || ''}`;
}

// Enhanced compatibility score calculation with profession matching and skill relevance
/**
 * @param {number} similarity
 * @param {any} profile1
 * @param {any} profile2
 * @returns {number}
 */
function calculateEnhancedScore(similarity, profile1, profile2) {
    let enhancedScore = similarity;
    
    // Boost score for matching interests (weighted by relevance)
    if (profile1.interests && profile2.interests) {
        const interests1 = Array.isArray(profile1.interests) ? profile1.interests : [];
        const interests2 = Array.isArray(profile2.interests) ? profile2.interests : [];
        const commonInterests = interests1.filter(function(interest) { 
            return interests2.includes(interest);
        }).length;
        
        // Calculate interest relevance score (more common interests = higher weight)
        const interestRelevance = commonInterests / Math.max(1, Math.min(interests1.length, interests2.length));
        enhancedScore += commonInterests * 0.1 * (1 + interestRelevance);
    }
    
    // Boost score for matching skills with higher weight
    if (profile1.skills && profile2.skills) {
        const skills1 = Array.isArray(profile1.skills) ? profile1.skills : [];
        const skills2 = Array.isArray(profile2.skills) ? profile2.skills : [];
        const commonSkills = skills1.filter(function(skill) {
            return skills2.includes(skill);
        }).length;
        
        // Calculate skill relevance score (more common skills = higher weight)
        const skillRelevance = commonSkills / Math.max(1, Math.min(skills1.length, skills2.length));
        enhancedScore += commonSkills * 0.2 * (1 + skillRelevance);
    }
    
    // Boost score for matching profession (exact match gets higher boost)
    if (profile1.profession && profile2.profession) {
        if (profile1.profession.toLowerCase() === profile2.profession.toLowerCase()) {
            enhancedScore += 0.25; // Significant boost for exact profession match
        } else {
            // Check for related professions (e.g., software engineer and developer)
            const relatedProfessions = {
                'software engineer': ['developer', 'programmer', 'coder'],
                'data scientist': ['analyst', 'machine learning', 'ai'],
                'designer': ['ux', 'ui', 'graphic'],
                'marketing': ['content', 'seo', 'social media'],
                'manager': ['lead', 'director', 'head']
            };
            
            // Check if professions are related
            for (const [baseProfession, related] of Object.entries(relatedProfessions)) {
                if ((profile1.profession.toLowerCase().includes(baseProfession) && 
                     related.some(rel => profile2.profession.toLowerCase().includes(rel))) ||
                    (profile2.profession.toLowerCase().includes(baseProfession) && 
                     related.some(rel => profile1.profession.toLowerCase().includes(rel)))) {
                    enhancedScore += 0.15; // Moderate boost for related professions
                    break;
                }
            }
        }
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
        
        // We're using Qdrant now, so no need to load FAISS indices
        // Verify Qdrant collections if client is initialized
        if (qdrantClient) {
            try {
                const userInfo = await qdrantClient.getCollection('users');
console.log(`Qdrant users collection has ${userInfo?.points_count || 0} vectors`);
                
                const networkInfo = await qdrantClient.getCollection('networks');
console.log(`Qdrant networks collection has ${networkInfo?.points_count || 0} vectors`);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.log('Qdrant collections not fully available yet:', errorMessage);
            }
        }
        
    } catch (error) {
        console.error('Error loading indices:', error);
    }
}

// Save mappings to disk
/**
 * @returns {Promise<boolean>}
 */
async function saveIndices() {
    try {
        const userMappingPath = path.join(__dirname, 'user_mapping.json');
        const networkMappingPath = path.join(__dirname, 'network_mapping.json');
        
        // Save mapping files
        await fs.promises.writeFile(userMappingPath, JSON.stringify(userMapping, null, 2));
        await fs.promises.writeFile(networkMappingPath, JSON.stringify(networkMapping, null, 2));
        
        // Qdrant data is persisted automatically in the Qdrant server
        // No need to explicitly save vector data
        
        console.log('User and network mappings saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving mappings:', error);
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
        
        // Initialize Qdrant collections
        await initializeIndices();
        
        // Skip clearing existing points for now
// We'll just add new points to the collection
        
        let addedCount = 0;
        const points = [];
        
        for (const user of users) {
            try {
                // Extract skills and profession from description and interests
                const skills = await extractSkills(user.description || '', user.interests || []);
                const profession = await extractProfession(user.description || '', user.interests || []);
                
                // Create enhanced profile with extracted data
                const enhancedProfile = {
                    name: user.name,
                    email: user.email,
                    description: user.description || '',
                    interests: user.interests || [],
                    skills: skills,
                    profession: profession,
                    location: user.location || ''
                };
                
                const profileText = await createProfileText(enhancedProfile);
                
                const embedding = await generateEmbedding(profileText);
                
                const userId = nextUserId++;
                
                // Add to points batch with enhanced payload
                // Only add if embedding is not null
                if (embedding) {
                    points.push({
                        id: userId - 1, // Qdrant uses 0-based IDs
                        vector: embedding, // This is guaranteed to be non-null due to the if check
                        payload: {
                            userId: userId,
                            dbId: user.id,
                            name: user.name,
                            email: user.email,
                            description: user.description,
                            interests: user.interests,
                            skills: skills,
                            profession: profession,
                            location: user.location || ''
                        }
                    });
                } else {
                    console.warn(`Skipping user ${user.name} (${user.id}) due to null embedding`);
                }
                
                userMapping[userId.toString()] = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    description: user.description,
                    interests: user.interests,
                    skills: skills,
                    profession: profession,
                    location: user.location || '',
                    profileText,
                    addedAt: new Date().toISOString()
                };
                
                addedCount++;
                console.log(`Added user ${user.name} (${user.id}) with internal ID ${userId}`);
            } catch (error) {
                console.error(`Error adding user ${user.name}:`, error);
            }
        }
        
        // Upload points in batch
        if (points.length > 0 && qdrantClient) {
            // Ensure no null vectors are included
            const validPoints = points.filter(point => point.vector !== null).map(point => {
                // Create a new point with guaranteed non-null vector
                return {
                    ...point,
                    vector: point.vector // TypeScript will infer this is non-null due to the filter
                };
            });
            await qdrantClient.upsert('users', {
                points: validPoints
            });
        }
        
        console.log(`Successfully added ${addedCount} users to Qdrant collection`);
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
        console.error('Error populating users:', error instanceof Error ? error.message : String(error));
        res.status(500).json({ error: 'Failed to populate users from database' });
    }
});

// Add user to Qdrant collection
app.post('/add_user', async (req, res) => {
    try {
        const userData = req.body;
        
        if (!userData.name) {
            return res.status(400).json({ error: 'User name is required' });
        }
        
        // Extract skills and profession from description and interests
        const skills = await extractSkills(userData.description || '', userData.interests || []);
        const profession = await extractProfession(userData.description || '', userData.interests || []);
        
        // Create enhanced profile with extracted data
        const enhancedProfile = {
            ...userData,
            skills: skills,
            profession: profession
        };
        
        // Create detailed profile text with extracted information
        const profileText = await createProfileText(enhancedProfile);
        const embedding = await generateEmbedding(profileText);
        
        // Add to Qdrant collection
        const userId = nextUserId++;
        
        // Add to Qdrant
        if (qdrantClient && embedding !== null) {
            await qdrantClient.upsert('users', {
                points: [{
                    id: userId - 1, // Qdrant uses 0-based IDs
                    vector: embedding, // embedding is guaranteed to be non-null here
                    payload: {
                        userId: userId,
                        ...userData,
                        skills: skills,
                        profession: profession
                    }
                }]
            });
        }
        
        // Store mapping
        userMapping[userId.toString()] = {
            ...userData,
            skills: skills,
            profession: profession,
            profileText,
            addedAt: new Date().toISOString()
        };
        
        console.log(`Added user ${userData.name} with ID ${userId} (Profession: ${profession}, Skills: ${skills.join(', ')})`);
        
        res.json({ 
            success: true, 
            userId, 
            skills: skills,
            profession: profession,
            message: `User ${userData.name} added successfully with extracted profile data` 
        });
        
    } catch (/** @type {any} */ error) {
        console.error('Error adding user:', error instanceof Error ? error.message : String(error));
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
        
        // Check if Qdrant client is available
        if (!qdrantClient) {
            return res.status(503).json({ 
                error: 'Vector search service unavailable', 
                message: 'The Qdrant vector database is not connected. Please check server logs.'
            });
        }
        
        // Extract skills and profession from query to enhance matching
        const extractedSkills = await extractSkills(query, []);
        const extractedProfession = await extractProfession(query, []);
        
        // Log extracted information
        console.log(`Query: "${query}"
Extracted skills: ${extractedSkills.join(', ')}
Extracted profession: ${extractedProfession}`);
        
        // Generate embedding for query
        const queryEmbedding = await generateEmbedding(query);
        
        try {
            // Search Qdrant collection
            const k = Math.max(1, Math.min(limit + 1, 100)); // Limit to reasonable number
            
            // Get collection info to check total vectors
       const collectionInfo = await qdrantClient.getCollection('users');
       const totalVectors = (collectionInfo && collectionInfo.points_count) || 0;
            
            // Search the user collection in Qdrant
            // Ensure queryEmbedding is not null before using it
            if (!queryEmbedding) {
                throw new Error('Query embedding is null or undefined');
            }
            
            /** @type {SearchParams} */
            const searchParams = {
                vector: queryEmbedding, // We've verified it's not null above
                limit: Math.max(1, Math.min(k, totalVectors)), // Ensure limit is at least 1
                with_payload: true,
                with_vectors: false,
                filter: undefined // Optional filter property
            };
            
            const results = await qdrantClient.search('users', searchParams);
            console.log("Qdrant results:", results.length);
            
            const recommendations = [];
            const queryUserProfile = userId ? userMapping[userId.toString()] : null;
            
            // Create a query profile with extracted information
            const queryProfile = {
                interests: [],
                skills: extractedSkills,
                profession: extractedProfession,
                location: ''
            };
            
            // If we have the actual user profile, merge with extracted data
            if (queryUserProfile) {
                queryProfile.interests = queryUserProfile.interests || [];
                queryProfile.location = queryUserProfile.location || '';
                // Merge extracted skills with user profile skills (if any)
                if (queryUserProfile.skills && queryUserProfile.skills.length > 0) {
                    queryProfile.skills = [...new Set([...extractedSkills, ...queryUserProfile.skills])];
                }
                // Use extracted profession if available, otherwise use profile profession
                if (!extractedProfession && queryUserProfile.profession) {
                    queryProfile.profession = queryUserProfile.profession;
                }
            }
            
            for (const result of results) {
                const resultUserId = result.payload && result.payload.userId;
                const similarity = result.score;
                
                // Skip if this is the querying user or if userId is undefined
                if (!resultUserId || (userId && resultUserId === parseInt(userId))) {
                    continue;
                }
                
                const userProfile = userMapping[resultUserId.toString()];
                if (userProfile) {
                    // Calculate enhanced score using the query profile with extracted data
                    const score = calculateEnhancedScore(similarity, queryProfile, userProfile);
                    
                    // Generate detailed explanation based on matching attributes
                    let explanation = `Matched with ${(similarity * 100).toFixed(1)}% similarity`;
                    
                    // Add details about matching attributes
                    const matchDetails = [];
                    
                    // Check for profession match
                    if (queryProfile.profession && userProfile.profession && 
                        queryProfile.profession.toLowerCase() === userProfile.profession.toLowerCase()) {
                        matchDetails.push(`same profession (${userProfile.profession})`);
                    }
                    
                    // Check for skill matches
                    if (queryProfile.skills && queryProfile.skills.length > 0 && 
                        userProfile.skills && userProfile.skills.length > 0) {
                        const commonSkills = queryProfile.skills.filter(skill => 
                            userProfile.skills.includes(skill)
                        );
                        if (commonSkills.length > 0) {
                            matchDetails.push(`${commonSkills.length} common skills`);
                        }
                    }
                    
                    // Add match details to explanation
                    if (matchDetails.length > 0) {
                        explanation += ` based on ${matchDetails.join(', ')}`;
                    }
                    
                    recommendations.push({
                        userId: resultUserId,
                        profile: userProfile,
                        similarity: similarity,
                        enhancedScore: score,
                        explanation: explanation
                    });
                }
                
                if (recommendations.length >= limit) break;
            }
            
            // Sort by enhanced score
            recommendations.sort((a, b) => b.enhancedScore - a.enhancedScore);
            
            res.json({ 
               query,
               extracted_skills: extractedSkills,
               extracted_profession: extractedProfession,
               recommendations: recommendations.slice(0, limit),
               message: "Enhanced recommendations with detailed profiles"
            });
        } catch (/** @type {any} */ error) {
            console.error('Error searching Qdrant:', error instanceof Error ? error.message : String(error));
            res.status(503).json({ 
                error: 'Vector search failed', 
                message: 'Failed to search the vector database. Please check server logs.'
            });
        }
    } catch (/** @type {any} */ error) {
        console.error('Error getting recommendations:', error instanceof Error ? error.message : String(error));
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});

// Qdrant-based recommendations endpoint for specific user
app.post('/recommendations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const top_n = typeof req.query.top_n === 'string' ? parseInt(req.query.top_n) : 10;
        const network_filter = typeof req.query.network_filter === 'string' ? req.query.network_filter : undefined;
        
        // Check if Qdrant client is available
        if (!qdrantClient) {
            return res.status(503).json({ 
                error: 'Vector search service unavailable', 
                message: 'The Qdrant vector database is not connected. Please check server logs.'
            });
        }
        
        // Get the target user's profile
        const users = await fetchUsersFromDatabase();
        const targetUser = users.find(u => u.id.toString() === userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Extract skills and profession from description and interests
        const skills = await extractSkills(targetUser.description || '', targetUser.interests || []);
        const profession = await extractProfession(targetUser.description || '', targetUser.interests || []);
        
        // Generate embedding for the target user's enhanced profile
        const enhancedProfile = {
            name: targetUser.name,
            email: targetUser.email,
            description: targetUser.description || '',
            interests: targetUser.interests || [],
            skills: skills,
            profession: profession,
            location: targetUser.location || ''
        };
        
        // Create detailed profile text with extracted information
        const profileText = await createProfileText(enhancedProfile);
        const userEmbedding = await generateEmbedding(profileText);
        if (!userEmbedding) {
            return res.status(500).json({ error: 'Failed to generate embedding for user profile' });
        }
        
        try {
            // Prepare search parameters
            /** @type {SearchParams} */
            const searchParams = {
                vector: userEmbedding,
                limit: Math.max(1, top_n + 5), // Get extra results for better filtering
                with_payload: true,
                with_vectors: false
            };
            
            // Apply network filter if specified
            if (network_filter) {
                searchParams.filter = {
                    must: [{ key: 'network_id', match: { value: parseInt(network_filter) } }]
                };
            }
            
            // Search for similar users in Qdrant
            const results = await qdrantClient.search('users', searchParams);
            
            const recommendations = [];
            for (const result of results) {
                const resultUserId = result.payload?.userId;
                const similarity = result.score;
                
                // Skip if this is the querying user or if userId is undefined
                if (!resultUserId || resultUserId === parseInt(userId)) {
                    continue;
                }
                
                const candidateProfile = userMapping[resultUserId.toString()];
                if (candidateProfile) {
                    // Apply network filter if specified (double-check in case filter didn't work)
                    if (network_filter && candidateProfile.network_id !== parseInt(network_filter)) {
                        continue;
                    }
                    
                    // Use the enhanced profile with extracted skills and profession
                    const enhancedScore = calculateEnhancedScore(similarity, {
                        name: targetUser.name,
                        interests: targetUser.interests || [],
                        skills: skills, // Use extracted skills
                        location: targetUser.location || '',
                        profession: profession // Use extracted profession
                    }, candidateProfile);
                    
                    // Generate detailed explanation based on matching attributes
                    let explanation = `Matched with ${(similarity * 100).toFixed(1)}% similarity`;
                    
                    // Add details about matching attributes
                    const matchDetails = [];
                    
                    // Check for profession match
                    if (profession && candidateProfile.profession && 
                        profession.toLowerCase() === candidateProfile.profession.toLowerCase()) {
                        matchDetails.push(`same profession (${profession})`);
                    }
                    
                    // Check for skill matches
                    if (skills && skills.length > 0 && candidateProfile.skills && candidateProfile.skills.length > 0) {
                        const commonSkills = skills.filter(skill => 
                            candidateProfile.skills.includes(skill)
                        );
                        if (commonSkills.length > 0) {
                            matchDetails.push(`${commonSkills.length} common skills`);
                        }
                    }
                    
                    // Check for interest matches
                    if (targetUser.interests && targetUser.interests.length > 0 && 
                        candidateProfile.interests && candidateProfile.interests.length > 0) {
                        /** @type {Array<string>} */
                        const commonInterests = targetUser.interests.filter(function(interest) {
                            return candidateProfile.interests.includes(interest);
                        });
                        if (commonInterests.length > 0) {
                            matchDetails.push(`${commonInterests.length} shared interests`);
                        }
                    }
                    
                    // Check for location match
                    if (targetUser.location && candidateProfile.location && 
                        targetUser.location.toLowerCase() === candidateProfile.location.toLowerCase()) {
                        matchDetails.push(`same location (${targetUser.location})`);
                    }
                    
                    // Add match details to explanation
                    if (matchDetails.length > 0) {
                        explanation += ` based on ${matchDetails.join(', ')}`;
                    }
                    
                    recommendations.push({
                        userId: resultUserId,
                        profile: candidateProfile,
                        similarity: similarity,
                        enhancedScore: enhancedScore,
                        explanation: explanation
                    });
                }
            }
            
            // Sort by enhanced score and limit results
            recommendations.sort((a, b) => b.enhancedScore - a.enhancedScore);
            const limitedRecommendations = recommendations.slice(0, top_n);
            
            res.json({
                success: true,
                userId: parseInt(userId),
                recommendations: limitedRecommendations,
                count: limitedRecommendations.length,
                total: limitedRecommendations.length,
                network_filter: network_filter || null,
                message: "Enhanced recommendations with detailed profile matching"
            });
        } catch (/** @type {any} */ error) {
            console.error('Error searching Qdrant:', error instanceof Error ? error.message : String(error));
            res.status(503).json({ 
                error: 'Vector search failed', 
                message: 'Failed to search the vector database. Please check server logs.'
            });
        }
    } catch (/** @type {any} */ error) {
        console.error('Error generating Qdrant recommendations:', error instanceof Error ? error.message : String(error));
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
app.delete('/users/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (userMapping[userId.toString()]) {
            // Remove from Qdrant collection
            if (qdrantClient) {
                const qdrantId = userId - 1; // Qdrant uses 0-based IDs
                await qdrantClient.delete('users', {
                    points: [qdrantId]
                });
            }
            
            // Remove from mapping
            delete userMapping[userId.toString()];
            
            res.json({ message: `User ${userId} deleted from Qdrant and mapping` });
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
        console.error('Error starting server:', error instanceof Error ? error.message : String(error));
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