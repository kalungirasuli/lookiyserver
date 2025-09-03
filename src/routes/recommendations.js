"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const recommendationController_1 = require("../controllers/recommendationController");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_1.authenticate);
// Get recommendations for a user in a specific network
router.get('/networks/:networkId', recommendationController_1.getRecommendations);
// Refresh recommendations for a user (force regeneration)
router.post('/networks/:networkId/refresh', recommendationController_1.refreshRecommendations);
// Mark a recommendation as acted upon
router.post('/networks/:networkId/acted-upon/:recommendedUserId', recommendationController_1.markRecommendationActedUpon);
// Get recommendation analytics for a network (admin only)
router.get('/networks/:networkId/analytics', recommendationController_1.getRecommendationAnalytics);
// Health check endpoint
router.get('/health', recommendationController_1.getRecommendationHealth);
exports.default = router;
