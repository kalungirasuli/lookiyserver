import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getRecommendations,
  refreshRecommendations,
  markRecommendationActedUpon,
  getRecommendationAnalytics,
  getRecommendationHealth
} from '../controllers/recommendationController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get recommendations for a user in a specific network
router.get('/networks/:networkId', getRecommendations);

// Refresh recommendations for a user (force regeneration)
router.post('/networks/:networkId/refresh', refreshRecommendations);

// Mark a recommendation as acted upon
router.post('/networks/:networkId/acted-upon/:recommendedUserId', markRecommendationActedUpon);

// Get recommendation analytics for a network (admin only)
router.get('/networks/:networkId/analytics', getRecommendationAnalytics);

// Health check endpoint
router.get('/health', getRecommendationHealth);

export default router;