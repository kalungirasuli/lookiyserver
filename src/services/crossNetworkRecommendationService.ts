import sql from '../utils/db';
import logger from '../utils/logger';
import axios from 'axios';
import redisClient from '../utils/redis';

interface UserProfile {
  id: string;
  name: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
  experience?: string;
  goals?: string[];
}

interface NetworkProfile {
  id: string;
  name: string;
  description?: string;
  goals?: string[];
  member_count: number;
}

interface CrossNetworkRecommendation {
  network_id: string;
  network_name: string;
  estimated_matches: number;
  sample_match_score: number;
  network_description?: string;
  member_count: number;
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

class CrossNetworkRecommendationService {
  private aiServiceUrl: string;
  private cacheExpiryHours: number = 24;
  private rateLimitWindow: number = 60000; // 1 minute
  private maxRequestsPerWindow: number = 10;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8002';
  }

  /**
   * Register network with FAISS + Gemini system
   */
  async registerNetworkWithAI(networkId: string): Promise<boolean> {
    try {
      const networkData = await this.getNetworkData(networkId);
      
      const registrationRequest = {
        network_id: networkId,
        network_data: {
          name: networkData.name,
          description: networkData.description,
          goals: networkData.goals || [],
          member_count: networkData.member_count
        }
      };

      const response = await axios.post(`${this.aiServiceUrl}/network/register`, registrationRequest);
      
      if (response.data.status === 'success') {
        logger.info(`Network ${networkId} registered with FAISS + Gemini system`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error registering network ${networkId} with AI service:`, error);
      return false;
    }
  }

  /**
   * Get network data for AI registration
   */
  private async getNetworkData(networkId: string): Promise<NetworkProfile> {
    try {
      const result = await sql`
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
      const goalsResult = await sql`
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
    } catch (error) {
      logger.error(`Error fetching network data for ${networkId}:`, error);
      throw error;
    }
  }

  /**
   * Get cross-network recommendations for a user
   */
  async getCrossNetworkRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<CrossNetworkRecommendation[]> {
    try {
      // Check rate limiting
      const rateLimitKey = `cross_network_rate_limit:${userId}`;
      const currentRequests = await redisClient.get(rateLimitKey);
      
      if (currentRequests && parseInt(currentRequests) >= this.maxRequestsPerWindow) {
        logger.warn(`Rate limit exceeded for user ${userId}`);
        // Return cached results if available
        return await this.getCachedCrossNetworkRecommendations(userId, limit);
      }

      // Increment rate limit counter
      await redisClient.setex(rateLimitKey, 60, (parseInt(currentRequests || '0') + 1).toString());

      // Check for cached recommendations
      const cachedRecommendations = await this.getCachedCrossNetworkRecommendations(userId, limit);
      if (cachedRecommendations.length > 0) {
        logger.info(`Returning ${cachedRecommendations.length} cached cross-network recommendations for user ${userId}`);
        return cachedRecommendations;
      }

      // Generate new cross-network recommendations
      const newRecommendations = await this.generateCrossNetworkRecommendations(userId);
      
      // Cache the recommendations
      await this.cacheCrossNetworkRecommendations(userId, newRecommendations);
      
      return newRecommendations.slice(0, limit);
    } catch (error) {
      logger.error('Error getting cross-network recommendations:', error);
      throw error;
    }
  }

  /**
   * Generate fresh cross-network recommendations
   */
  private async generateCrossNetworkRecommendations(
    userId: string
  ): Promise<CrossNetworkRecommendation[]> {
    try {
      // Get user profile
      const userProfile = await this.getUserProfile(userId);
      
      // Get user's current networks
      const userNetworks = await this.getUserNetworks(userId);
      const userNetworkIds = userNetworks.map(n => n.id);
      
      // Get candidate networks using optimized search strategy
      const candidateNetworks = await this.getCandidateNetworks(userId, userNetworkIds);
      
      if (candidateNetworks.length === 0) {
        logger.info(`No candidate networks found for user ${userId}`);
        return [];
      }

      const recommendations: CrossNetworkRecommendation[] = [];

      // Process each candidate network
      for (const network of candidateNetworks) {
        try {
          // Sample users from this network
          const sampleUsers = await this.sampleNetworkUsers(network.id, 5);
          
          if (sampleUsers.length === 0) continue;

          // Get match scores for sampled users
          const aiRecommendations = await this.callAIService({
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
              sample_match_score: bestMatch?.match_score || 0,
              network_description: network.description,
              member_count: network.member_count
            });
          }
        } catch (error) {
          logger.error(`Error processing network ${network.id}:`, error);
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

      logger.info(`Generated ${recommendations.length} cross-network recommendations for user ${userId}`);
      return recommendations;
    } catch (error) {
      logger.error('Error generating cross-network recommendations:', error);
      throw error;
    }
  }

  /**
   * Get candidate networks using optimized search strategy
   */
  private async getCandidateNetworks(
    userId: string,
    userNetworkIds: string[]
  ): Promise<NetworkProfile[]> {
    try {
      // Start from users in common/shared networks and user connections
      const connectedUserNetworks = await sql`
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
    } catch (error) {
      logger.error('Error getting candidate networks:', error);
      throw error;
    }
  }

  /**
   * Sample users from a network for match scoring
   */
  private async sampleNetworkUsers(
    networkId: string,
    sampleSize: number = 5
  ): Promise<UserProfile[]> {
    try {
      const users = await sql`
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
    } catch (error) {
      logger.error('Error sampling network users:', error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  private async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      const [user] = await sql`
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
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  /**
   * Get user's current networks
   */
  private async getUserNetworks(userId: string): Promise<NetworkProfile[]> {
    try {
      const networks = await sql`
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
    } catch (error) {
      logger.error('Error getting user networks:', error);
      throw error;
    }
  }

  /**
   * Call the AI service for recommendations
   */
  private async callAIService(request: RecommendationRequest): Promise<RecommendationResponse> {
    try {
      // Try new FAISS + Gemini endpoint first
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
   * Get AI service health and statistics
   */
  async getAIServiceHealth(): Promise<any> {
     try {
       const response = await axios.get(`${this.aiServiceUrl}/health`);
       return response.data;
     } catch (error) {
       logger.error('Error getting AI service health:', error);
       return { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
     }
   }

   /**
    * Get FAISS statistics
    */
   async getFAISSStats(): Promise<any> {
     try {
       const response = await axios.get(`${this.aiServiceUrl}/stats`);
       return response.data;
     } catch (error) {
       logger.error('Error getting FAISS stats:', error);
       return { error: error instanceof Error ? error.message : String(error) };
     }
   }

  /**
   * Cache cross-network recommendations
   */
  private async cacheCrossNetworkRecommendations(
    userId: string,
    recommendations: CrossNetworkRecommendation[]
  ): Promise<void> {
    try {
      const cacheKey = `cross_network_recommendations:${userId}`;
      const cacheData = JSON.stringify(recommendations);
      await redisClient.setex(cacheKey, this.cacheExpiryHours * 3600, cacheData);
      
      logger.info(`Cached ${recommendations.length} cross-network recommendations for user ${userId}`);
    } catch (error) {
      logger.error('Error caching cross-network recommendations:', error);
    }
  }

  /**
   * Get cached cross-network recommendations
   */
  private async getCachedCrossNetworkRecommendations(
    userId: string,
    limit: number
  ): Promise<CrossNetworkRecommendation[]> {
    try {
      const cacheKey = `cross_network_recommendations:${userId}`;
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        const recommendations: CrossNetworkRecommendation[] = JSON.parse(cachedData);
        return recommendations.slice(0, limit);
      }
      
      return [];
    } catch (error) {
      logger.error('Error getting cached cross-network recommendations:', error);
      return [];
    }
  }

  /**
   * Clear cached recommendations for a user
   */
  async clearCachedRecommendations(userId: string): Promise<void> {
    try {
      const cacheKey = `cross_network_recommendations:${userId}`;
      await redisClient.del(cacheKey);
      
      logger.info(`Cleared cached cross-network recommendations for user ${userId}`);
    } catch (error) {
      logger.error('Error clearing cached recommendations:', error);
    }
  }

  /**
   * Refresh recommendations for all active users (periodic job)
   */
  async refreshAllRecommendations(): Promise<void> {
    try {
      logger.info('Starting cross-network recommendations refresh for all users');
      
      // Get all active users
      const activeUsers = await sql`
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
          await this.clearCachedRecommendations(user.id);
          
          // Generate fresh recommendations
          await this.generateCrossNetworkRecommendations(user.id);
          
          processedCount++;
          
          // Add small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Error refreshing recommendations for user ${user.id}:`, error);
          continue;
        }
      }
      
      logger.info(`Completed cross-network recommendations refresh for ${processedCount} users`);
    } catch (error) {
      logger.error('Error in refreshAllRecommendations:', error);
      throw error;
    }
  }
}

export default new CrossNetworkRecommendationService();