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
exports.recommendationService = void 0;
const db_1 = __importDefault(require("../utils/db"));
const logger_1 = __importDefault(require("../utils/logger"));
const axios_1 = __importDefault(require("axios"));
class RecommendationService {
    constructor() {
        this.cacheExpiryHours = 24;
        this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8002';
    }
    /**
     * Register user with FAISS + Gemini system
     */
    registerUserWithAI(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userProfile = yield this.getUserProfile(userId);
                const registrationRequest = {
                    user_id: userId,
                    profile_data: {
                        name: userProfile.name,
                        bio: userProfile.bio,
                        skills: userProfile.skills || [],
                        interests: userProfile.interests || [],
                        experience: userProfile.experience,
                        goals: userProfile.goals || []
                    }
                };
                const response = yield axios_1.default.post(`${this.aiServiceUrl}/register`, registrationRequest);
                if (response.data.status === 'success') {
                    logger_1.default.info(`User ${userId} registered with FAISS + Gemini system`);
                    return true;
                }
                return false;
            }
            catch (error) {
                logger_1.default.error(`Error registering user ${userId} with AI service:`, error);
                return false;
            }
        });
    }
    /**
     * Get FAISS-based recommendations for a user
     */
    getFAISSRecommendations(userId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, topN = 10, networkFilter) {
            try {
                const url = `${this.aiServiceUrl}/recommendations/${userId}`;
                const params = Object.assign({ top_n: topN }, (networkFilter && { network_filter: networkFilter }));
                const response = yield axios_1.default.post(url, {}, { params });
                if (response.data.recommendations) {
                    const recommendations = [];
                    for (const rec of response.data.recommendations) {
                        recommendations.push({
                            id: crypto.randomUUID(), // Generate unique ID
                            user_id: userId,
                            recommended_user_id: rec.user_id,
                            network_id: networkFilter || '',
                            match_score: rec.match_score,
                            is_served: false,
                            served_at: undefined,
                            is_acted_upon: false,
                            acted_upon_at: undefined,
                            created_at: new Date(),
                            updated_at: new Date()
                        });
                    }
                    return recommendations;
                }
                return [];
            }
            catch (error) {
                logger_1.default.error(`Error getting FAISS recommendations for user ${userId}:`, error);
                return [];
            }
        });
    }
    /**
     * Remove user from FAISS index
     */
    removeUserFromAI(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield axios_1.default.delete(`${this.aiServiceUrl}/user/${userId}`);
                if (response.data.status === 'success' || response.data.status === 'warning') {
                    logger_1.default.info(`User ${userId} removed from FAISS index`);
                    return true;
                }
                return false;
            }
            catch (error) {
                logger_1.default.error(`Error removing user ${userId} from AI service:`, error);
                return false;
            }
        });
    }
    /**
     * Get recommendations for a user in a specific network
     */
    getRecommendationsForUser(userId_1, networkId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, networkId, limit = 10) {
            try {
                // Check if we have fresh cached recommendations
                const cachedRecommendations = yield this.getCachedRecommendations(userId, networkId);
                if (cachedRecommendations.length > 0) {
                    logger_1.default.info(`Returning ${cachedRecommendations.length} cached recommendations for user ${userId}`);
                    return cachedRecommendations.slice(0, limit);
                }
                // Generate new recommendations
                const newRecommendations = yield this.generateRecommendations(userId, networkId);
                // Cache the recommendations
                yield this.cacheRecommendations(newRecommendations);
                return newRecommendations.slice(0, limit);
            }
            catch (error) {
                logger_1.default.error('Error getting recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Generate fresh recommendations using AI service
     */
    generateRecommendations(userId, networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Clear old unserved recommendations for this user to avoid duplicates
                yield this.clearOldUserRecommendations(userId, networkId);
                // Get user profile
                const userProfile = yield this.getUserProfile(userId);
                // Get network context
                const networkContext = yield this.getNetworkContext(networkId);
                // Get candidate users from the same network, excluding previously recommended users
                const candidateProfiles = yield this.getCandidateProfiles(userId, networkId);
                if (candidateProfiles.length === 0) {
                    logger_1.default.info(`No candidates found for user ${userId} in network ${networkId}`);
                    return [];
                }
                // Call AI service for recommendations
                const aiRecommendations = yield this.callAIService({
                    user_profile: userProfile,
                    candidate_profiles: candidateProfiles,
                    network_context: networkContext
                });
                // Convert AI response to database format
                const recommendations = aiRecommendations.recommendations.map(rec => ({
                    id: '', // Will be generated by database
                    user_id: userId,
                    recommended_user_id: rec.user_id,
                    network_id: networkId,
                    match_score: rec.match_score,
                    is_served: false,
                    is_acted_upon: false,
                    created_at: new Date(),
                    updated_at: new Date()
                }));
                logger_1.default.info(`Generated ${recommendations.length} fresh recommendations for user ${userId}`);
                return recommendations;
            }
            catch (error) {
                logger_1.default.error('Error generating recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Get cached recommendations that are still fresh and relevant
     */
    getCachedRecommendations(userId, networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            const cutoffTime = new Date();
            cutoffTime.setHours(cutoffTime.getHours() - this.cacheExpiryHours);
            // First, check if user has any recent served recommendations
            const recentServedRecs = yield (0, db_1.default) `
      SELECT * FROM user_recommendations 
      WHERE user_id = ${userId} 
        AND network_id = ${networkId}
        AND is_served = true
        AND served_at > ${cutoffTime}
      ORDER BY served_at DESC
    `;
            // If user has recent served recommendations but none were acted upon,
            // we should generate fresh recommendations instead of using cache
            if (recentServedRecs.length > 0) {
                const actedUponCount = recentServedRecs.filter(rec => rec.is_acted_upon).length;
                const engagementRate = actedUponCount / recentServedRecs.length;
                // If engagement rate is low (< 10%), generate fresh recommendations
                if (engagementRate < 0.1) {
                    logger_1.default.info(`Low engagement rate (${(engagementRate * 100).toFixed(1)}%) for user ${userId}, generating fresh recommendations`);
                    return [];
                }
            }
            // Get unserved cached recommendations
            const recommendations = yield (0, db_1.default) `
      SELECT * FROM user_recommendations 
      WHERE user_id = ${userId} 
        AND network_id = ${networkId}
        AND created_at > ${cutoffTime}
        AND is_served = false
      ORDER BY match_score DESC
    `;
            return recommendations;
        });
    }
    /**
     * Cache recommendations in database
     */
    cacheRecommendations(recommendations) {
        return __awaiter(this, void 0, void 0, function* () {
            if (recommendations.length === 0)
                return;
            try {
                for (const rec of recommendations) {
                    yield (0, db_1.default) `
          INSERT INTO user_recommendations (
            user_id, recommended_user_id, network_id, match_score
          ) VALUES (
            ${rec.user_id}, ${rec.recommended_user_id}, ${rec.network_id}, ${rec.match_score}
          )
          ON CONFLICT (user_id, recommended_user_id, network_id) 
          DO UPDATE SET 
            match_score = EXCLUDED.match_score,
            updated_at = CURRENT_TIMESTAMP
        `;
                }
                logger_1.default.info(`Cached ${recommendations.length} recommendations`);
            }
            catch (error) {
                logger_1.default.error('Error caching recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Get user profile for AI processing
     */
    getUserProfile(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [user] = yield (0, db_1.default) `
      SELECT u.id, u.name, u.bio, u.skills, u.interests, u.experience
      FROM users u
      WHERE u.id = ${userId}
    `;
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }
            // Get user's goals from networks they're in
            const userGoals = yield (0, db_1.default) `
      SELECT DISTINCT ng.title
      FROM user_network_goals ung
      JOIN network_goals ng ON ung.goal_id = ng.id
      WHERE ung.user_id = ${userId}
    `;
            return {
                id: user.id,
                name: user.name,
                bio: user.bio,
                skills: user.skills || [],
                interests: user.interests || [],
                experience: user.experience,
                goals: userGoals.map(g => g.title)
            };
        });
    }
    /**
     * Get network context for AI processing
     */
    getNetworkContext(networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [network] = yield (0, db_1.default) `
      SELECT id, name, description
      FROM networks
      WHERE id = ${networkId}
    `;
            if (!network) {
                throw new Error(`Network ${networkId} not found`);
            }
            // Get network goals
            const networkGoals = yield (0, db_1.default) `
      SELECT title
      FROM network_goals
      WHERE network_id = ${networkId}
    `;
            return {
                id: network.id,
                name: network.name,
                description: network.description,
                goals: networkGoals.map(g => g.title)
            };
        });
    }
    /**
     * Get candidate user profiles from the same network, excluding previously recommended users and existing connections
     */
    getCandidateProfiles(userId, networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get recently recommended user IDs to exclude them from new recommendations
            const recentlyRecommendedIds = yield (0, db_1.default) `
      SELECT DISTINCT recommended_user_id
      FROM user_recommendations
      WHERE user_id = ${userId}
        AND network_id = ${networkId}
        AND created_at > NOW() - INTERVAL '7 days'
    `;
            // Get existing connections to exclude them from recommendations
            const existingConnections = yield (0, db_1.default) `
      SELECT CASE 
        WHEN user_id_1 = ${userId} THEN user_id_2
        ELSE user_id_1
      END as connected_user_id
      FROM connections
      WHERE user_id_1 = ${userId} OR user_id_2 = ${userId}
    `;
            // Get pending connection requests to exclude them as well
            const pendingConnections = yield (0, db_1.default) `
      SELECT CASE 
        WHEN from_user_id = ${userId} THEN to_user_id
        ELSE from_user_id
      END as user_id
      FROM connection_requests
      WHERE (from_user_id = ${userId} OR to_user_id = ${userId})
        AND status = 'pending'
    `;
            const excludeIds = [
                ...recentlyRecommendedIds.map(r => r.recommended_user_id),
                ...existingConnections.map(c => c.connected_user_id),
                ...pendingConnections.map(p => p.user_id),
                userId // Also exclude the user themselves
            ];
            const candidates = yield (0, db_1.default) `
      SELECT DISTINCT u.id, u.name, u.bio, u.skills, u.interests, u.experience
      FROM users u
      JOIN network_members nm ON u.id = nm.user_id
      WHERE nm.network_id = ${networkId}
        AND u.id != ALL(${excludeIds})
        AND nm.status = 'active'
    `;
            // Get goals for each candidate
            const candidateProfiles = [];
            for (const candidate of candidates) {
                const candidateGoals = yield (0, db_1.default) `
        SELECT DISTINCT ng.title
        FROM user_network_goals ung
        JOIN network_goals ng ON ung.goal_id = ng.id
        WHERE ung.user_id = ${candidate.id}
      `;
                candidateProfiles.push({
                    id: candidate.id,
                    name: candidate.name,
                    bio: candidate.bio,
                    skills: candidate.skills || [],
                    interests: candidate.interests || [],
                    experience: candidate.experience,
                    goals: candidateGoals.map(g => g.title)
                });
            }
            return candidateProfiles;
        });
    }
    /**
     * Call the AI service for recommendations
     */
    callAIService(request) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
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
     * Mark recommendations as served
     */
    markRecommendationsAsServed(userId, recommendedUserIds) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield (0, db_1.default) `
        UPDATE user_recommendations 
        SET is_served = true, served_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} 
          AND recommended_user_id = ANY(${recommendedUserIds})
      `;
                logger_1.default.info(`Marked ${recommendedUserIds.length} recommendations as served for user ${userId}`);
            }
            catch (error) {
                logger_1.default.error('Error marking recommendations as served:', error);
                throw error;
            }
        });
    }
    /**
     * Mark recommendation as acted upon (user connected/messaged)
     */
    markRecommendationAsActedUpon(userId, recommendedUserId, networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield (0, db_1.default) `
        UPDATE user_recommendations 
        SET is_acted_upon = true, acted_upon_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} 
          AND recommended_user_id = ${recommendedUserId}
          AND network_id = ${networkId}
      `;
                logger_1.default.info(`Marked recommendation as acted upon: ${userId} -> ${recommendedUserId}`);
            }
            catch (error) {
                logger_1.default.error('Error marking recommendation as acted upon:', error);
                throw error;
            }
        });
    }
    /**
     * Clear old unserved recommendations for a specific user to avoid duplicates
     */
    clearOldUserRecommendations(userId, networkId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield (0, db_1.default) `
        DELETE FROM user_recommendations 
        WHERE user_id = ${userId}
          AND network_id = ${networkId}
          AND is_served = false
      `;
                logger_1.default.info(`Cleared ${result.count} old unserved recommendations for user ${userId}`);
            }
            catch (error) {
                logger_1.default.error('Error clearing old user recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Clear old recommendations to keep database clean
     */
    clearOldRecommendations() {
        return __awaiter(this, arguments, void 0, function* (daysOld = 7) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            try {
                const result = yield (0, db_1.default) `
        DELETE FROM user_recommendations 
        WHERE created_at < ${cutoffDate}
      `;
                logger_1.default.info(`Cleared ${result.count} old recommendations`);
            }
            catch (error) {
                logger_1.default.error('Error clearing old recommendations:', error);
                throw error;
            }
        });
    }
    /**
     * Force refresh recommendations for a user (ignores cache)
     */
    forceRefreshRecommendations(userId_1, networkId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, networkId, limit = 10) {
            try {
                logger_1.default.info(`Force refreshing recommendations for user ${userId} in network ${networkId}`);
                // Generate new recommendations (this will clear old ones automatically)
                const newRecommendations = yield this.generateRecommendations(userId, networkId);
                // Cache the recommendations
                yield this.cacheRecommendations(newRecommendations);
                return newRecommendations.slice(0, limit);
            }
            catch (error) {
                logger_1.default.error('Error force refreshing recommendations:', error);
                throw error;
            }
        });
    }
}
exports.recommendationService = new RecommendationService();
exports.default = exports.recommendationService;
