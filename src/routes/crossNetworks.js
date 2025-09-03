"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const crossNetworkController_1 = require("../controllers/crossNetworkController");
const router = express_1.default.Router();
// Get cross-network recommendations for authenticated user
router.get('/', auth_1.authenticate, crossNetworkController_1.getCrossNetworkRecommendations);
// Refresh cross-network recommendations for authenticated user
router.post('/refresh', auth_1.authenticate, crossNetworkController_1.refreshCrossNetworkRecommendations);
// Get cross-network analytics (admin only)
router.get('/analytics', auth_1.authenticate, crossNetworkController_1.getCrossNetworkAnalytics);
// Health check endpoint
router.get('/health', crossNetworkController_1.getCrossNetworkHealth);
// FAISS + Gemini AI endpoints
// Register network with FAISS + Gemini system (admin/leader only)
router.post('/networks/:networkId/register-ai', auth_1.authenticate, crossNetworkController_1.registerNetworkWithAI);
// Get FAISS statistics and AI service information
router.get('/faiss/stats', crossNetworkController_1.getFAISSStats);
// Rebuild FAISS index (admin only)
router.post('/faiss/rebuild', auth_1.authenticate, crossNetworkController_1.rebuildFAISSIndex);
exports.default = router;
