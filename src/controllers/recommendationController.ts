import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import recommendationService from '../services/recommendationService';
import { kafkaService, KafkaTopics } from '../utils/kafka';
import sql from '../utils/db';

/**
 * Get recommendations for a user in a specific network
 */
export async function getRecommendations(req: AuthRequest, res: Response) {
  try {
    const { networkId } = req.params;
    const { limit = 10 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!networkId) {
      return res.status(400).json({ error: 'Network ID is required' });
    }

    // Check if user is a member of the network
    const [membership] = await sql`
      SELECT status FROM network_members 
      WHERE user_id = ${userId} AND network_id = ${networkId}
    `;

    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'User is not an active member of this network' });
    }

    // Get recommendations
    const recommendations = await recommendationService.getRecommendationsForUser(
      userId,
      networkId,
      parseInt(limit as string)
    );

    // Get user details for each recommendation
    const recommendationDetails = [];
    for (const rec of recommendations) {
      const [user] = await sql`
        SELECT id, name, bio, skills, interests
        FROM users
        WHERE id = ${rec.recommended_user_id}
      `;

      if (user) {
        recommendationDetails.push({
          id: rec.id,
          user: {
            id: user.id,
            name: user.name,
            bio: user.bio,
            skills: user.skills || [],
            interests: user.interests || []
          },
          match_score: rec.match_score,
          created_at: rec.created_at
        });
      }
    }

    // Mark recommendations as served
    const recommendedUserIds = recommendationDetails.map(r => r.user.id);
    if (recommendedUserIds.length > 0) {
      await recommendationService.markRecommendationsAsServed(userId, recommendedUserIds);
    }

    // Publish analytics event
    await kafkaService.publishEvent(KafkaTopics.USER_ACTIVITY, {
      type: 'recommendations_served',
      user_id: userId,
      network_id: networkId,
      count: recommendationDetails.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      recommendations: recommendationDetails,
      total: recommendationDetails.length,
      network_id: networkId
    });

    logger.info(`Served ${recommendationDetails.length} recommendations to user ${userId} in network ${networkId}`);
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
}

/**
 * Refresh recommendations for a user (force regeneration)
 */
export async function refreshRecommendations(req: AuthRequest, res: Response) {
  try {
    const { networkId } = req.params;
    const { limit = 10 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!networkId) {
      return res.status(400).json({ error: 'Network ID is required' });
    }

    // Check if user is a member of the network
    const [membership] = await sql`
      SELECT status FROM network_members 
      WHERE user_id = ${userId} AND network_id = ${networkId}
    `;

    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'User is not an active member of this network' });
    }

    // Use the new force refresh method that handles intelligent caching
    const recommendations = await recommendationService.forceRefreshRecommendations(
      userId,
      networkId,
      parseInt(limit as string)
    );

    // Get user details for each recommendation
    const recommendationDetails = [];
    for (const rec of recommendations) {
      const [user] = await sql`
        SELECT id, name, bio, skills, interests
        FROM users
        WHERE id = ${rec.recommended_user_id}
      `;

      if (user) {
        recommendationDetails.push({
          id: rec.id,
          user: {
            id: user.id,
            name: user.name,
            bio: user.bio,
            skills: user.skills || [],
            interests: user.interests || []
          },
          match_score: rec.match_score,
          created_at: rec.created_at
        });
      }
    }

    // Publish analytics event
    await kafkaService.publishEvent(KafkaTopics.USER_ACTIVITY, {
      type: 'recommendations_refreshed',
      user_id: userId,
      network_id: networkId,
      count: recommendations.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Recommendations refreshed successfully',
      recommendations: recommendationDetails,
      count: recommendations.length
    });

    logger.info(`Force refreshed recommendations for user ${userId} in network ${networkId}`);
  } catch (error) {
    logger.error('Error refreshing recommendations:', error);
    res.status(500).json({ error: 'Failed to refresh recommendations' });
  }
}

/**
 * Mark a recommendation as acted upon (when user connects/messages)
 */
export async function markRecommendationActedUpon(req: AuthRequest, res: Response) {
  try {
    const { networkId, recommendedUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!networkId || !recommendedUserId) {
      return res.status(400).json({ error: 'Network ID and recommended user ID are required' });
    }

    // Mark recommendation as acted upon
    await recommendationService.markRecommendationAsActedUpon(
      userId,
      recommendedUserId,
      networkId
    );

    // Publish analytics event
    await kafkaService.publishEvent(KafkaTopics.USER_ACTIVITY, {
      type: 'recommendation_acted_upon',
      user_id: userId,
      recommended_user_id: recommendedUserId,
      network_id: networkId,
      timestamp: new Date().toISOString()
    });

    res.json({ message: 'Recommendation marked as acted upon' });

    logger.info(`User ${userId} acted upon recommendation for user ${recommendedUserId} in network ${networkId}`);
  } catch (error) {
    logger.error('Error marking recommendation as acted upon:', error);
    res.status(500).json({ error: 'Failed to mark recommendation as acted upon' });
  }
}

/**
 * Get recommendation analytics for a network (admin only)
 */
export async function getRecommendationAnalytics(req: AuthRequest, res: Response) {
  try {
    const { networkId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!networkId) {
      return res.status(400).json({ error: 'Network ID is required' });
    }

    // Check if user is an admin of the network
    const [membership] = await sql`
      SELECT role FROM network_members 
      WHERE user_id = ${userId} AND network_id = ${networkId}
    `;

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get analytics data
    const [totalRecommendations] = await sql`
      SELECT COUNT(*) as count
      FROM user_recommendations
      WHERE network_id = ${networkId}
    `;

    const [servedRecommendations] = await sql`
      SELECT COUNT(*) as count
      FROM user_recommendations
      WHERE network_id = ${networkId} AND is_served = true
    `;

    const [actedUponRecommendations] = await sql`
      SELECT COUNT(*) as count
      FROM user_recommendations
      WHERE network_id = ${networkId} AND is_acted_upon = true
    `;

    const [avgMatchScore] = await sql`
      SELECT AVG(match_score) as avg_score
      FROM user_recommendations
      WHERE network_id = ${networkId}
    `;

    const topMatches = await sql`
      SELECT 
        u1.name as user_name,
        u2.name as recommended_user_name,
        ur.match_score,
        ur.is_acted_upon,
        ur.created_at
      FROM user_recommendations ur
      JOIN users u1 ON ur.user_id = u1.id
      JOIN users u2 ON ur.recommended_user_id = u2.id
      WHERE ur.network_id = ${networkId}
      ORDER BY ur.match_score DESC
      LIMIT 10
    `;

    const analytics = {
      total_recommendations: parseInt(totalRecommendations.count),
      served_recommendations: parseInt(servedRecommendations.count),
      acted_upon_recommendations: parseInt(actedUponRecommendations.count),
      average_match_score: parseFloat(avgMatchScore.avg_score || '0'),
      conversion_rate: servedRecommendations.count > 0 
        ? (actedUponRecommendations.count / servedRecommendations.count) * 100 
        : 0,
      top_matches: topMatches
    };

    res.json(analytics);

    logger.info(`Served recommendation analytics for network ${networkId} to admin ${userId}`);
  } catch (error) {
    logger.error('Error getting recommendation analytics:', error);
    res.status(500).json({ error: 'Failed to get recommendation analytics' });
  }
}

/**
 * Health check for recommendation system
 */
export async function getRecommendationHealth(req: Request, res: Response) {
  try {
    // Check AI service health
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const axios = require('axios');
    
    let aiServiceHealthy = false;
    try {
      const response = await axios.get(`${aiServiceUrl}/health`, { timeout: 5000 });
      aiServiceHealthy = response.status === 200;
    } catch (error) {
      logger.warn('AI service health check failed:', error);
    }

    // Check database connectivity
    let dbHealthy = false;
    try {
      await sql`SELECT 1`;
      dbHealthy = true;
    } catch (error) {
      logger.error('Database health check failed:', error);
    }

    const health = {
      status: aiServiceHealthy && dbHealthy ? 'healthy' : 'degraded',
      ai_service: aiServiceHealthy ? 'healthy' : 'unhealthy',
      database: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString()
    };

    res.json(health);
  } catch (error) {
    logger.error('Error checking recommendation system health:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
}