import cron from 'node-cron';
import logger from './logger';
import { processPermanentDeletions } from '../controllers/authController';

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

  logger.info('Scheduled jobs initialized');
}