import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getCrossNetworkRecommendations,
  refreshCrossNetworkRecommendations,
  getCrossNetworkAnalytics,
  getCrossNetworkHealth,
  registerNetworkWithAI,
  getFAISSStats,
  rebuildFAISSIndex
} from '../controllers/crossNetworkController';

const router = express.Router();

// Get cross-network recommendations for authenticated user
router.get('/', authenticate, getCrossNetworkRecommendations);

// Refresh cross-network recommendations for authenticated user
router.post('/refresh', authenticate, refreshCrossNetworkRecommendations);

// Get cross-network analytics (admin only)
router.get('/analytics', authenticate, getCrossNetworkAnalytics);

// Health check endpoint
router.get('/health', getCrossNetworkHealth);

// FAISS + Gemini AI endpoints

// Register network with FAISS + Gemini system (admin/leader only)
router.post('/networks/:networkId/register-ai', authenticate, registerNetworkWithAI);

// Get FAISS statistics and AI service information
router.get('/faiss/stats', getFAISSStats);

// Rebuild FAISS index (admin only)
router.post('/faiss/rebuild', authenticate, rebuildFAISSIndex);

export default router;