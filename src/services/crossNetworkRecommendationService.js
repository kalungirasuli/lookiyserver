"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../utils/db"));
const logger_1 = __importDefault(require("../utils/logger"));
const axios_1 = __importDefault(require("axios"));
const redis_1 = __importDefault(require("../utils/redis"));
class CrossNetworkRecommendationService {
    constructor() {
        this.cacheExpiryHours = 24;
        this.rateLimitWindow = 60000; // 1 minute
        this.maxRequestsPerWindow = 10;
        this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8002';
    }
    /**
     * Register network with FAISS + Gemini system
     */
    registerNetworkWithAI(networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const networkData = yield this.getNetworkData(networkId);
                const registrationRequest = {
                    network_id: networkId,
                    network_data: {
                        name: networkData.name,
                        description: networkData.description,
                        goals: networkData.goals || [],
                        member_count: networkData.member_count
                    }
                };
                const response = yield axios_1.default.post(`${this.aiServiceUrl}/network/register`, registrationRequest);
                if (response.data.status === 'success') {
                    logger_1.default.info(`Network ${networkId} registered with FAISS + Gemini system`);
                    return true;
                }
                return false;
            }
            catch (error) {
                logger_1.default.error(`Error registering network ${networkId} with AI service:`, error);
                return false;
            }
        });
    }
    /**
     * Get network data for AI registration
     */
    getNetworkData(networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield (0, db_1.default) `
        SELECT 
          id,
          name,
          description,
          (
            SELECT COUNT(*) 
            FROM network_members 
            WHERE network_id = networks.id
          ) as member_count
        FROM networks 
        WHERE id = ${networkId}
      `;
                if (result.length === 0) {
                    throw new Error(`Network ${networkId} not found`);
                }
                const network = result[0];
                // Get network goals
                const goalsResult = yield (0, db_1.default) `
        SELECT title 
        FROM network_goals 
        WHERE network_id = ${networkId}
      `;
                return {
                    id: network.id,
                    name: network.name,
                    description: network.description,
                    goals: goalsResult.map(g => g.title),
                    member_count: parseInt(network.member_count)
                };
            }
            catch (error) {
                logger_1.default.error(`Error fetching network data for ${networkId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Get cross-network recommendations for a user
     */
    getCrossNetworkRecommendations(userId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, limit = 10) {
            try {
                // Check rate limiting
                const rateLimitKey = `cross_network_rate_limit:${userId}`;
                const currentRequests = yield redis_1.default.get(rateLimitKey);
                if (currentRequests && parseInt(currentRequests) >= this.maxRequestsPerWindow) {
                    logger_1.default.warn(`Rate limit exceeded for user ${userId}`);
                    // Return cached results if available
                    return yield this.getCachedCrossNetworkRecommendations(userId, limit);
                }
                // Increment rate limit counter
                yield redis_1.default.setex(rateLimitKey, 60, (parseInt(currentRequests || '0') + 1).toString());
                // Check for cached recommendations
                const cachedRecommendations = yield this.getCachedCrossNetworkRecommendations(userId, limit);
                if (cachedRecommendations.length > 0) {
                    logger_1.default.info(`Returning ${cachedRecommendations.length} cached cross-network recommendations for user ${userId}`);
                    return cachedRecommendations;
                }
                // Generate new cross-network recommendations
                const newRecommendations = yield this.generateCrossNetworkRecommendations(userId);
                // Cache the recommendations
                yield this.cacheCrossNetworkRecommendations(userId, newRecommendations);
                return newRecommendations.slice(0, limit);
            }
            catch (error) {
                logger_1.default.error('Error getting cross-network recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Generate fresh cross-network recommendations
     */
    generateCrossNetworkRecommendations(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get user profile
                const userProfile = yield this.getUserProfile(userId);
                // Get user's current networks
                const userNetworks = yield this.getUserNetworks(userId);
                const userNetworkIds = userNetworks.map(n => n.id);
                // Get candidate networks using optimized search strategy
                const candidateNetworks = yield this.getCandidateNetworks(userId, userNetworkIds);
                if (candidateNetworks.length === 0) {
                    logger_1.default.info(`No candidate networks found for user ${userId}`);
                    return [];
                }
                const recommendations = [];
                // Process each candidate network
                for (const network of candidateNetworks) {
                    try {
                        // Sample users from this network
                        const sampleUsers = yield this.sampleNetworkUsers(network.id, 5);
                        if (sampleUsers.length === 0)
                            continue;
                        // Get match scores for sampled users
                        const aiRecommendations = yield this.callAIService({
                            user_profile: userProfile,
                            candidate_profiles: sampleUsers,
                            network_context: {
                                id: network.id,
                                name: network.name,
                                description: network.description,
                                goals: network.goals
                            }
                        });
                        // Calculate estimated matches (users with score >= 0.8)
                        const highScoreMatches = aiRecommendations.recommendations.filter(r => r.match_score >= 0.8);
                        const estimatedMatches = Math.round((highScoreMatches.length / sampleUsers.length) * network.member_count);
                        if (estimatedMatches > 0) {
                            const bestMatch = aiRecommendations.recommendations[0];
                            recommendations.push({
                                network_id: network.id,
                                network_name: network.name,
                                estimated_matches: estimatedMatches,
                                sample_match_score: (bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.match_score) || 0,
                                network_description: network.description,
                                member_count: network.member_count
                            });
                        }
                    }
                    catch (error) {
                        logger_1.default.error(`Error processing network ${network.id}:`, error);
                        continue;
                    }
                }
                // Sort by estimated matches and sample match score
                recommendations.sort((a, b) => {
                    if (a.estimated_matches !== b.estimated_matches) {
                        return b.estimated_matches - a.estimated_matches;
                    }
                    return b.sample_match_score - a.sample_match_score;
                });
                logger_1.default.info(`Generated ${recommendations.length} cross-network recommendations for user ${userId}`);
                return recommendations;
            }
            catch (error) {
                logger_1.default.error('Error generating cross-network recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Get candidate networks using optimized search strategy
     */
    getCandidateNetworks(userId, userNetworkIds) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Start from users in common/shared networks and user connections
                const connectedUserNetworks = yield (0, db_1.default) `
        SELECT DISTINCT n.id, n.name, n.description, n.goals,
               COUNT(nm.user_id) as member_count
        FROM networks n
        JOIN network_members nm ON n.id = nm.network_id
        WHERE nm.user_id IN (
          -- Users from same networks
          SELECT DISTINCT nm2.user_id
          FROM network_members nm2
          WHERE nm2.network_id = ANY(${userNetworkIds})
          AND nm2.user_id != ${userId}
          AND nm2.status = 'active'
          
          UNION
          
          -- Connected users
          SELECT CASE 
            WHEN c.requester_id = ${userId} THEN c.recipient_id
            ELSE c.requester_id
          END as connected_user_id
          FROM connections c
          WHERE (c.requester_id = ${userId} OR c.recipient_id = ${userId})
          AND c.status = 'accepted'
        )
        AND n.id != ALL(${userNetworkIds})
        AND n.status = 'active'
        AND nm.status = 'active'
        GROUP BY n.id, n.name, n.description, n.goals
        HAVING COUNT(nm.user_id) >= 3
        ORDER BY member_count DESC
        LIMIT 20
      `;
                return connectedUserNetworks.map(network => ({
                    id: network.id,
                    name: network.name,
                    description: network.description,
                    goals: network.goals || [],
                    member_count: parseInt(network.member_count)
                }));
            }
            catch (error) {
                logger_1.default.error('Error getting candidate networks:', error);
                throw error;
            }
        });
    }
    /**
     * Sample users from a network for match scoring
     */
    sampleNetworkUsers(networkId_1) {
        return __awaiter(this, arguments, void 0, function* (networkId, sampleSize = 5) {
            try {
                const users = yield (0, db_1.default) `
        SELECT u.id, u.name, u.bio, u.skills, u.interests, u.experience, u.goals
        FROM users u
        JOIN network_members nm ON u.id = nm.user_id
        WHERE nm.network_id = ${networkId}
        AND nm.status = 'active'
        AND u.name IS NOT NULL
        ORDER BY RANDOM()
        LIMIT ${sampleSize}
      `;
                return users.map(user => ({
                    id: user.id,
                    name: user.name,
                    bio: user.bio,
                    skills: user.skills || [],
                    interests: user.interests || [],
                    experience: user.experience,
                    goals: user.goals || []
                }));
            }
            catch (error) {
                logger_1.default.error('Error sampling network users:', error);
                throw error;
            }
        });
    }
    /**
     * Get user profile
     */
    getUserProfile(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [user] = yield (0, db_1.default) `
        SELECT id, name, bio, skills, interests, experience, goals
        FROM users
        WHERE id = ${userId}
      `;
                if (!user) {
                    throw new Error(`User ${userId} not found`);
                }
                return {
                    id: user.id,
                    name: user.name,
                    bio: user.bio,
                    skills: user.skills || [],
                    interests: user.interests || [],
                    experience: user.experience,
                    goals: user.goals || []
                };
            }
            catch (error) {
                logger_1.default.error('Error getting user profile:', error);
                throw error;
            }
        });
    }
    /**
     * Get user's current networks
     */
    getUserNetworks(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const networks = yield (0, db_1.default) `
        SELECT n.id, n.name, n.description, n.goals
        FROM networks n
        JOIN network_members nm ON n.id = nm.network_id
        WHERE nm.user_id = ${userId}
        AND nm.status = 'active'
        AND n.status = 'active'
      `;
                return networks.map(network => ({
                    id: network.id,
                    name: network.name,
                    description: network.description,
                    goals: network.goals || [],
                    member_count: 0 // Not needed for user's own networks
                }));
            }
            catch (error) {
                logger_1.default.error('Error getting user networks:', error);
                throw error;
            }
        });
    }
    /**
     * Call the AI service for recommendations
     */
    callAIService(request) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                // Try new FAISS + Gemini endpoint first
                if ((_a = request.user_profile) === null || _a === void 0 ? void 0 : _a.id) {
                    try {
                        const faissResponse = yield axios_1.default.post(`${this.aiServiceUrl}/recommendations/${request.user_profile.id}`, {}, {
                            params: {
                                top_n: 10,
                                network_filter: (_b = request.network_context) === null || _b === void 0 ? void 0 : _b.id
                            },
                            timeout: 30000
                        });
                        if (faissResponse.data.recommendations) {
                            return {
                                recommendations: faissResponse.data.recommendations.map((rec) => ({
                                    user_id: rec.user_id,
                                    match_score: rec.match_score,
                                    explanation: rec.explanation || `FAISS similarity match (score: ${rec.match_score.toFixed(3)})`
                                }))
                            };
                        }
                    }
                    catch (faissError) {
                        logger_1.default.warn('FAISS endpoint failed, falling back to legacy endpoint:', faissError);
                    }
                }
                // Fallback to legacy endpoint
                const response = yield axios_1.default.post(`${this.aiServiceUrl}/recommend`, request, {
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                return response.data;
            }
            catch (error) {
                logger_1.default.error('Error calling AI service:', error);
                throw new Error('AI service unavailable');
            }
        });
    }
    /**
     * Get AI service health and statistics
     */
    getAIServiceHealth() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield axios_1.default.get(`${this.aiServiceUrl}/health`);
                return response.data;
            }
            catch (error) {
                logger_1.default.error('Error getting AI service health:', error);
                return { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
            }
        });
    }
    /**
     * Get FAISS statistics
     */
    getFAISSStats() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield axios_1.default.get(`${this.aiServiceUrl}/stats`);
                return response.data;
            }
            catch (error) {
                logger_1.default.error('Error getting FAISS stats:', error);
                return { error: error instanceof Error ? error.message : String(error) };
            }
        });
    }
    /**
     * Cache cross-network recommendations
     */
    cacheCrossNetworkRecommendations(userId, recommendations) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const cacheKey = `cross_network_recommendations:${userId}`;
                const cacheData = JSON.stringify(recommendations);
                yield redis_1.default.setex(cacheKey, this.cacheExpiryHours * 3600, cacheData);
                logger_1.default.info(`Cached ${recommendations.length} cross-network recommendations for user ${userId}`);
            }
            catch (error) {
                logger_1.default.error('Error caching cross-network recommendations:', error);
            }
        });
    }
    /**
     * Get cached cross-network recommendations
     */
    getCachedCrossNetworkRecommendations(userId, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const cacheKey = `cross_network_recommendations:${userId}`;
                const cachedData = yield redis_1.default.get(cacheKey);
                if (cachedData) {
                    const recommendations = JSON.parse(cachedData);
                    return recommendations.slice(0, limit);
                }
                return [];
            }
            catch (error) {
                logger_1.default.error('Error getting cached cross-network recommendations:', error);
                return [];
            }
        });
    }
    /**
     * Clear cached recommendations for a user
     */
    clearCachedRecommendations(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const cacheKey = `cross_network_recommendations:${userId}`;
                yield redis_1.default.del(cacheKey);
                logger_1.default.info(`Cleared cached cross-network recommendations for user ${userId}`);
            }
            catch (error) {
                logger_1.default.error('Error clearing cached recommendations:', error);
            }
        });
    }
    /**
     * Refresh recommendations for all active users (periodic job)
     */
    refreshAllRecommendations() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.default.info('Starting cross-network recommendations refresh for all users');
                // Get all active users
                const activeUsers = yield (0, db_1.default) `
        SELECT DISTINCT u.id
        FROM users u
        JOIN network_members nm ON u.id = nm.user_id
        WHERE nm.status = 'active'
        AND u.created_at > NOW() - INTERVAL '30 days'
        LIMIT 100
      `;
                let processedCount = 0;
                for (const user of activeUsers) {
                    try {
                        // Clear old cache
                        yield this.clearCachedRecommendations(user.id);
                        // Generate fresh recommendations
                        yield this.generateCrossNetworkRecommendations(user.id);
                        processedCount++;
                        // Add small delay to avoid overwhelming the system
                        yield new Promise(resolve => setTimeout(resolve, 100));
                    }
                    catch (error) {
                        logger_1.default.error(`Error refreshing recommendations for user ${user.id}:`, error);
                        continue;
                    }
                }
                logger_1.default.info(`Completed cross-network recommendations refresh for ${processedCount} users`);
            }
            catch (error) {
                logger_1.default.error('Error in refreshAllRecommendations:', error);
                throw error;
            }
        });
    }
}
exports.default = new CrossNetworkRecommendationService();
