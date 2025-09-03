import sql from '../utils/db';
import logger from '../utils/logger';
import { UserRecommendation } from '../models/database';
import axios from 'axios';
import { randomUUID } from 'crypto';

interface UserProfile {
  id: string;
  name: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
  experience?: string;
  goals?: string[];
}

interface RecommendationRequest {
  user_profile: UserProfile;
  candidate_profiles: UserProfile[];
  network_context?: {
    id: string;
    name: string;
    description?: string;
    goals?: string[];
  };
}

interface RecommendationResponse {
  recommendations: {
    user_id: string;
    match_score: number;
    explanation?: string;
  }[];
}

class RecommendationService {
  private aiServiceUrl: string;
  private cacheExpiryHours: number = 24;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8002';
  }

  /**
   * Register user with FAISS + Gemini system
   */
  async registerUserWithAI(userId: string): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(userId);
      
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

      const response = await axios.post(`${this.aiServiceUrl}/register`, registrationRequest);
      
      if (response.data.status === 'success') {
        logger.info(`User ${userId} registered with FAISS + Gemini system`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error registering user ${userId} with AI service:`, error);
      return false;
    }
  }

  /**
   * Get FAISS-based recommendations for a user
   */
  async getFAISSRecommendations(
    userId: string, 
    topN: number = 10, 
    networkFilter?: string
  ): Promise<UserRecommendation[]> {
    try {
      const url = `${this.aiServiceUrl}/recommendations/${userId}`;
      const params = {
        top_n: topN,
        ...(networkFilter && { network_filter: networkFilter })
      };

      const response = await axios.post(url, {}, { params });
      
      if (response.data.recommendations) {
        const recommendations: UserRecommendation[] = [];
        
        for (const rec of response.data.recommendations) {
           recommendations.push({
             id: randomUUID(), // Generate unique ID
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
    } catch (error) {
      logger.error(`Error getting FAISS recommendations for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Remove user from FAISS index
   */
  async removeUserFromAI(userId: string): Promise<boolean> {
    try {
      const response = await axios.delete(`${this.aiServiceUrl}/user/${userId}`);
      
      if (response.data.status === 'success' || response.data.status === 'warning') {
        logger.info(`User ${userId} removed from FAISS index`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error removing user ${userId} from AI service:`, error);
      return false;
    }
  }

  /**
   * Get recommendations for a user in a specific network
   */
  async getRecommendationsForUser(
    userId: string, 
    networkId: string, 
    limit: number = 10
  ): Promise<UserRecommendation[]> {
    try {
      // Check if we have fresh cached recommendations
      const cachedRecommendations = await this.getCachedRecommendations(userId, networkId);
      if (cachedRecommendations.length > 0) {
        logger.info(`Returning ${cachedRecommendations.length} cached recommendations for user ${userId}`);
        return cachedRecommendations.slice(0, limit);
      }

      // Generate new recommendations
      const newRecommendations = await this.generateRecommendations(userId, networkId);
      
      // Cache the recommendations
      await this.cacheRecommendations(newRecommendations);
      
      return newRecommendations.slice(0, limit);
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      throw error;
    }
  }

  /**
   * Generate fresh recommendations using AI service (FAISS-based)
   */
  private async generateRecommendations(
    userId: string, 
    networkId: string
  ): Promise<UserRecommendation[]> {
    try {
      // Clear old unserved recommendations for this user to avoid duplicates
      await this.clearOldUserRecommendations(userId, networkId);
      
      // Try FAISS-based AI recommendations first (like cross-network)
      try {
        const faissRecommendations = await this.getFAISSRecommendations(userId, 10, networkId);
        if (faissRecommendations.length > 0) {
          logger.info(`Generated ${faissRecommendations.length} FAISS-based recommendations for user ${userId} in network ${networkId}`);
          return faissRecommendations;
        }
      } catch (faissError) {
        logger.warn(`FAISS recommendations failed for user ${userId}, falling back to traditional method:`, faissError);
      }
      
      // Fallback to traditional method if FAISS fails
      // Get user profile
      const userProfile = await this.getUserProfile(userId);
      
      // Get network context
      const networkContext = await this.getNetworkContext(networkId);
      
      // Get candidate users from the same network, excluding previously recommended users
      const candidateProfiles = await this.getCandidateProfiles(userId, networkId);
      
      if (candidateProfiles.length === 0) {
        logger.info(`No candidates found for user ${userId} in network ${networkId}`);
        return [];
      }

      // Call AI service for recommendations (traditional method)
      const aiRecommendations = await this.callAIService({
        user_profile: userProfile,
        candidate_profiles: candidateProfiles,
        network_context: networkContext
      });

      // Convert AI response to database format
      const recommendations: UserRecommendation[] = aiRecommendations.recommendations.map(rec => ({
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

      logger.info(`Generated ${recommendations.length} traditional AI recommendations for user ${userId}`);
      return recommendations;
    } catch (error) {
      logger.error('Error generating recommendations:', error);
      throw error;
    }
  }

  /**
   * Get cached recommendations that are still fresh and relevant
   */
  private async getCachedRecommendations(
    userId: string, 
    networkId: string
  ): Promise<UserRecommendation[]> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - this.cacheExpiryHours);

    // First, check if user has any recent served recommendations
    const recentServedRecs = await sql<UserRecommendation[]>`
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
        logger.info(`Low engagement rate (${(engagementRate * 100).toFixed(1)}%) for user ${userId}, generating fresh recommendations`);
        return [];
      }
    }

    // Get unserved cached recommendations
    const recommendations = await sql<UserRecommendation[]>`
      SELECT * FROM user_recommendations 
      WHERE user_id = ${userId} 
        AND network_id = ${networkId}
        AND created_at > ${cutoffTime}
        AND is_served = false
      ORDER BY match_score DESC
    `;

    return recommendations;
  }

  /**
   * Cache recommendations in database
   */
  private async cacheRecommendations(recommendations: UserRecommendation[]): Promise<void> {
    if (recommendations.length === 0) return;

    try {
      for (const rec of recommendations) {
        await sql`
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
      logger.info(`Cached ${recommendations.length} recommendations`);
    } catch (error) {
      logger.error('Error caching recommendations:', error);
      throw error;
    }
  }

  /**
   * Get user profile for AI processing
   */
  private async getUserProfile(userId: string): Promise<UserProfile> {
    const [user] = await sql`
      SELECT u.id, u.name, u.bio, u.skills, u.interests, u.experience
      FROM users u
      WHERE u.id = ${userId}
    `;

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Get user's goals from networks they're in
    const userGoals = await sql`
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
  }

  /**
   * Get network context for AI processing
   */
  private async getNetworkContext(networkId: string) {
    const [network] = await sql`
      SELECT id, name, description
      FROM networks
      WHERE id = ${networkId}
    `;

    if (!network) {
      throw new Error(`Network ${networkId} not found`);
    }

    // Get network goals
    const networkGoals = await sql`
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
  }

  /**
   * Get candidate user profiles from the same network, excluding previously recommended users and existing connections
   */
  private async getCandidateProfiles(userId: string, networkId: string): Promise<UserProfile[]> {
    // Get recently recommended user IDs to exclude them from new recommendations
    const recentlyRecommendedIds = await sql<{recommended_user_id: string}[]>`
      SELECT DISTINCT recommended_user_id
      FROM user_recommendations
      WHERE user_id = ${userId}
        AND network_id = ${networkId}
        AND created_at > NOW() - INTERVAL '7 days'
    `;

    // Get existing connections to exclude them from recommendations
    const existingConnections = await sql<{connected_user_id: string}[]>`
      SELECT CASE 
        WHEN user_id_1 = ${userId} THEN user_id_2
        ELSE user_id_1
      END as connected_user_id
      FROM connections
      WHERE user_id_1 = ${userId} OR user_id_2 = ${userId}
    `;

    // Get pending connection requests to exclude them as well
    const pendingConnections = await sql<{user_id: string}[]>`
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

    const candidates = await sql`
      SELECT DISTINCT u.id, u.name, u.bio, u.skills, u.interests, u.experience
      FROM users u
      JOIN network_members nm ON u.id = nm.user_id
      WHERE nm.network_id = ${networkId}
        AND u.id != ALL(${excludeIds})
        AND nm.status = 'active'
    `;

    // Get goals for each candidate
    const candidateProfiles: UserProfile[] = [];
    for (const candidate of candidates) {
      const candidateGoals = await sql`
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
  }

  /**
   * Call the AI service for recommendations
   */
  private async callAIService(request: RecommendationRequest): Promise<RecommendationResponse> {
    try {
      // Try new FAISS + Gemini endpoint first (like cross-network)
      if (request.user_profile?.id) {
        try {
          const faissResponse = await axios.post(
            `${this.aiServiceUrl}/recommendations/${request.user_profile.id}`,
            {},
            {
              params: {
                top_n: 10,
                network_filter: request.network_context?.id
              },
              timeout: 30000
            }
          );
          
          if (faissResponse.data.recommendations) {
            return {
              recommendations: faissResponse.data.recommendations.map((rec: any) => ({
                user_id: rec.user_id,
                match_score: rec.match_score,
                explanation: rec.explanation || `FAISS similarity match (score: ${rec.match_score.toFixed(3)})`
              }))
            };
          }
        } catch (faissError) {
          logger.warn('FAISS endpoint failed, falling back to legacy endpoint:', faissError);
        }
      }
      
      // Fallback to legacy endpoint
      const response = await axios.post(`${this.aiServiceUrl}/recommend`, request, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error calling AI service:', error);
      throw new Error('AI service unavailable');
    }
  }

  /**
   * Mark recommendations as served
   */
  async markRecommendationsAsServed(userId: string, recommendedUserIds: string[]): Promise<void> {
    try {
      await sql`
        UPDATE user_recommendations 
        SET is_served = true, served_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} 
          AND recommended_user_id = ANY(${recommendedUserIds})
      `;
      logger.info(`Marked ${recommendedUserIds.length} recommendations as served for user ${userId}`);
    } catch (error) {
      logger.error('Error marking recommendations as served:', error);
      throw error;
    }
  }

  /**
   * Mark recommendation as acted upon (user connected/messaged)
   */
  async markRecommendationAsActedUpon(
    userId: string, 
    recommendedUserId: string, 
    networkId: string
  ): Promise<void> {
    try {
      await sql`
        UPDATE user_recommendations 
        SET is_acted_upon = true, acted_upon_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} 
          AND recommended_user_id = ${recommendedUserId}
          AND network_id = ${networkId}
      `;
      logger.info(`Marked recommendation as acted upon: ${userId} -> ${recommendedUserId}`);
    } catch (error) {
      logger.error('Error marking recommendation as acted upon:', error);
      throw error;
    }
  }

  /**
   * Clear old unserved recommendations for a specific user to avoid duplicates
   */
  private async clearOldUserRecommendations(userId: string, networkId: string): Promise<void> {
    try {
      const result = await sql`
        DELETE FROM user_recommendations 
        WHERE user_id = ${userId}
          AND network_id = ${networkId}
          AND is_served = false
      `;
      logger.info(`Cleared ${result.count} old unserved recommendations for user ${userId}`);
    } catch (error) {
      logger.error('Error clearing old user recommendations:', error);
      throw error;
    }
  }

  /**
   * Clear old recommendations to keep database clean
   */
  async clearOldRecommendations(daysOld: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const result = await sql`
        DELETE FROM user_recommendations 
        WHERE created_at < ${cutoffDate}
      `;
      logger.info(`Cleared ${result.count} old recommendations`);
    } catch (error) {
      logger.error('Error clearing old recommendations:', error);
      throw error;
    }
  }

  /**
   * Force refresh recommendations for a user (ignores cache)
   */
  async forceRefreshRecommendations(
    userId: string, 
    networkId: string, 
    limit: number = 10
  ): Promise<UserRecommendation[]> {
    try {
      logger.info(`Force refreshing recommendations for user ${userId} in network ${networkId}`);
      
      // Generate new recommendations (this will clear old ones automatically)
      const newRecommendations = await this.generateRecommendations(userId, networkId);
      
      // Cache the recommendations
      await this.cacheRecommendations(newRecommendations);
      
      return newRecommendations.slice(0, limit);
    } catch (error) {
      logger.error('Error force refreshing recommendations:', error);
      throw error;
    }
  }
}

export const recommendationService = new RecommendationService();
export default recommendationService;