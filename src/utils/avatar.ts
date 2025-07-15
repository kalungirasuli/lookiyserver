import * as jdenticon from 'jdenticon';
import { uploadToGCS } from './storage';
import crypto from 'crypto';
import logger from './logger';

/**
 * Generates a random avatar using Jdenticon and uploads it to GCS
 * @param userId - User's ID to use as seed for consistent avatar generation
 * @returns Promise<string> - URL of the uploaded avatar
 */
export async function generateAndUploadAvatar(userId: string): Promise<string> {
  try {
    // Generate a PNG avatar using Jdenticon
    const size = 400; // Size of the avatar in pixels
    const pngBuffer = jdenticon.toPng(userId, size);

    // Create a file object that matches Express.Multer.File interface
    const avatarFile: Express.Multer.File = {
      fieldname: 'avatar',
      originalname: `${userId}-avatar.png`,
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: pngBuffer,
      size: pngBuffer.length,
      stream: null as any,
      destination: '',
      filename: '',
      path: ''
    };

    // Upload to Google Cloud Storage
    const avatarUrl = await uploadToGCS(avatarFile);
    logger.info('Generated and uploaded avatar', { userId, avatarUrl });
    
    return avatarUrl;
  } catch (error) {
    logger.error('Failed to generate or upload avatar', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Failed to generate avatar');
  }
}