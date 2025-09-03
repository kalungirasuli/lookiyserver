import cron from 'node-cron';
import logger from './logger';
import { processPermanentDeletions } from '../controllers/authController';
import { cleanupExpiredSuspensions } from '../controllers/networkController';
import recommendationService from '../services/recommendationService';
import crossNetworkRecommendationService from '../services/crossNetworkRecommendationService';

// Run account cleanup job at midnight every day
export function startScheduledJobs() {
  // Schedule account deletion processing - runs at 00:00 every day
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running scheduled account deletion cleanup');
    try {
      await processPermanentDeletions();
      logger.info('Account deletion cleanup completed successfully');
    } catch (error) {
      logger.error('Account deletion cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Schedule recommendation cleanup - runs at 02:00 every day
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled recommendation cleanup');
    try {
      await recommendationService.clearOldRecommendations(7); // Clear recommendations older than 7 days
      logger.info('Recommendation cleanup completed successfully');
    } catch (error) {
      logger.error('Recommendation cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Schedule expired suspension cleanup - runs at 03:00 every day
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running scheduled expired suspension cleanup');
    try {
      await cleanupExpiredSuspensions();
      logger.info('Expired suspension cleanup completed successfully');
    } catch (error) {
      logger.error('Expired suspension cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Schedule cross-network recommendations refresh - runs at 04:00 every day
  cron.schedule('0 4 * * *', async () => {
    logger.info('Running scheduled cross-network recommendations refresh');
    try {
      await crossNetworkRecommendationService.refreshAllRecommendations();
      logger.info('Cross-network recommendations refresh completed successfully');
    } catch (error) {
      logger.error('Cross-network recommendations refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info('Scheduled jobs initialized');
}