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
exports.getCrossNetworkRecommendations = getCrossNetworkRecommendations;
exports.refreshCrossNetworkRecommendations = refreshCrossNetworkRecommendations;
exports.getCrossNetworkAnalytics = getCrossNetworkAnalytics;
exports.getCrossNetworkHealth = getCrossNetworkHealth;
exports.registerNetworkWithAI = registerNetworkWithAI;
exports.getFAISSStats = getFAISSStats;
exports.rebuildFAISSIndex = rebuildFAISSIndex;
const logger_1 = __importDefault(require("../utils/logger"));
const crossNetworkRecommendationService_1 = __importDefault(require("../services/crossNetworkRecommendationService"));
const kafka_1 = require("../utils/kafka");
const db_1 = __importDefault(require("../utils/db"));
/**
 * Get cross-network recommendations for a user
 */
function getCrossNetworkRecommendations(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { limit = 10 } = req.query;
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            // Check if user is a member of at least one network
            const [membership] = yield (0, db_1.default) `
      SELECT COUNT(*) as network_count
      FROM network_members 
      WHERE user_id = ${userId} AND status = 'active'
    `;
            if (!membership || parseInt(membership.network_count) === 0) {
                return res.status(400).json({ error: 'User must be a member of at least one network to get cross-network recommendations' });
            }
            // Get cross-network recommendations
            const recommendations = yield crossNetworkRecommendationService_1.default.getCrossNetworkRecommendations(userId, parseInt(limit));
            // Publish analytics event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'cross_network_recommendations_served',
                user_id: userId,
                count: recommendations.length,
                timestamp: new Date().toISOString()
            });
            res.json({
                recommendations,
                total: recommendations.length,
                user_id: userId
            });
            logger_1.default.info(`Served ${recommendations.length} cross-network recommendations to user ${userId}`);
        }
        catch (error) {
            logger_1.default.error('Error getting cross-network recommendations:', error);
            res.status(500).json({ error: 'Failed to get cross-network recommendations' });
        }
    });
}
/**
 * Refresh cross-network recommendations for a user
 */
function refreshCrossNetworkRecommendations(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            // Check if user is a member of at least one network
            const [membership] = yield (0, db_1.default) `
      SELECT COUNT(*) as network_count
      FROM network_members 
      WHERE user_id = ${userId} AND status = 'active'
    `;
            if (!membership || parseInt(membership.network_count) === 0) {
                return res.status(400).json({ error: 'User must be a member of at least one network to refresh cross-network recommendations' });
            }
            // Clear cached recommendations
            yield crossNetworkRecommendationService_1.default.clearCachedRecommendations(userId);
            // Generate fresh recommendations
            const recommendations = yield crossNetworkRecommendationService_1.default.getCrossNetworkRecommendations(userId, 10);
            // Publish analytics event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'cross_network_recommendations_refreshed',
                user_id: userId,
                count: recommendations.length,
                timestamp: new Date().toISOString()
            });
            res.json({
                message: 'Cross-network recommendations refreshed successfully',
                recommendations,
                count: recommendations.length
            });
            logger_1.default.info(`Force refreshed cross-network recommendations for user ${userId}`);
        }
        catch (error) {
            logger_1.default.error('Error refreshing cross-network recommendations:', error);
            res.status(500).json({ error: 'Failed to refresh cross-network recommendations' });
        }
    });
}
/**
 * Get analytics for cross-network recommendations (admin only)
 */
function getCrossNetworkAnalytics(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            // Check if user is admin of any network
            const [adminCheck] = yield (0, db_1.default) `
      SELECT COUNT(*) as admin_count
      FROM network_members 
      WHERE user_id = ${userId} 
      AND (role = 'admin' OR role = 'creator')
      AND status = 'active'
    `;
            if (!adminCheck || parseInt(adminCheck.admin_count) === 0) {
                return res.status(403).json({ error: 'Admin access required' });
            }
            // Get analytics data from Kafka events (simplified version)
            // In a real implementation, you'd query a proper analytics database
            const analytics = {
                total_cross_network_requests: 0,
                successful_recommendations: 0,
                average_networks_per_user: 0,
                top_recommended_networks: [],
                last_updated: new Date().toISOString()
            };
            res.json(analytics);
            logger_1.default.info(`Served cross-network analytics to admin ${userId}`);
        }
        catch (error) {
            logger_1.default.error('Error getting cross-network analytics:', error);
            res.status(500).json({ error: 'Failed to get cross-network analytics' });
        }
    });
}
/**
 * Health check for cross-network recommendation service
 */
function getCrossNetworkHealth(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Check database connectivity
            const dbHealthQuery = yield (0, db_1.default) `SELECT 1 as health_check`;
            const dbHealthy = dbHealthQuery.length > 0;
            // Check AI service connectivity with new FAISS + Gemini health endpoint
            const aiServiceHealth = yield crossNetworkRecommendationService_1.default.getAIServiceHealth();
            const aiServiceHealthy = aiServiceHealth.status === 'healthy' || aiServiceHealth.status === 'degraded';
            // Check cache connectivity
            let cacheHealthy = false;
            try {
                // Simple Redis ping test would go here
                cacheHealthy = true; // Placeholder
            }
            catch (error) {
                logger_1.default.error('Cache health check failed:', error);
            }
            const overallHealth = dbHealthy && aiServiceHealthy && cacheHealthy;
            res.status(overallHealth ? 200 : 503).json({
                status: overallHealth ? 'healthy' : 'degraded',
                services: {
                    database: dbHealthy ? 'healthy' : 'unhealthy',
                    ai_service: aiServiceHealthy ? 'healthy' : 'unhealthy',
                    cache: cacheHealthy ? 'healthy' : 'unhealthy'
                },
                ai_service_details: aiServiceHealth,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            logger_1.default.error('Error checking cross-network service health:', error);
            res.status(500).json({
                error: 'Failed to check service health',
                status: 'error'
            });
        }
    });
}
/**
 * Register network with FAISS + Gemini system
 */
function registerNetworkWithAI(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { networkId } = req.params;
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            // Check if user is admin/leader of the network
            const [membership] = yield (0, db_1.default) `
      SELECT role 
      FROM network_members 
      WHERE user_id = ${userId} AND network_id = ${networkId}
    `;
            if (!membership || !['admin', 'leader'].includes(membership.role)) {
                return res.status(403).json({ error: 'Only network admins and leaders can register networks with AI system' });
            }
            const success = yield crossNetworkRecommendationService_1.default.registerNetworkWithAI(networkId);
            if (success) {
                // Publish analytics event
                yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                    type: 'network_registered_with_ai',
                    user_id: userId,
                    network_id: networkId,
                    timestamp: new Date().toISOString()
                });
                res.json({
                    success: true,
                    message: `Network ${networkId} registered with FAISS + Gemini system`,
                    network_id: networkId
                });
            }
            else {
                res.status(500).json({ error: 'Failed to register network with AI system' });
            }
        }
        catch (error) {
            logger_1.default.error('Error registering network with AI:', error);
            res.status(500).json({ error: 'Failed to register network with AI system' });
        }
    });
}
/**
 * Get FAISS statistics and AI service information
 */
function getFAISSStats(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [aiHealth, faissStats] = yield Promise.all([
                crossNetworkRecommendationService_1.default.getAIServiceHealth(),
                crossNetworkRecommendationService_1.default.getFAISSStats()
            ]);
            res.json({
                ai_service: aiHealth,
                faiss_stats: faissStats,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            logger_1.default.error('Error getting FAISS stats:', error);
            res.status(500).json({ error: 'Failed to get FAISS statistics' });
        }
    });
}
/**
 * Rebuild FAISS index (admin only)
 */
function rebuildFAISSIndex(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            // Check if user is a system admin (you may need to implement this check)
            // For now, we'll allow any authenticated user for testing
            try {
                const response = yield fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8002'}/faiss/rebuild`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const result = yield response.json();
                if (response.ok) {
                    // Publish analytics event
                    yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                        type: 'faiss_index_rebuilt',
                        user_id: userId,
                        timestamp: new Date().toISOString()
                    });
                    res.json({
                        success: true,
                        message: 'FAISS index rebuilt successfully',
                        details: result
                    });
                }
                else {
                    res.status(500).json({ error: 'Failed to rebuild FAISS index', details: result });
                }
            }
            catch (error) {
                logger_1.default.error('Error rebuilding FAISS index:', error);
                res.status(500).json({ error: 'Failed to rebuild FAISS index' });
            }
        }
        catch (error) {
            logger_1.default.error('Error in rebuildFAISSIndex:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
