import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import logger from './logger';
import { decryptServiceAccountKeyInMemory } from './keyDecrypt';
import dotenv from 'dotenv';

// Load environment variables at the start
dotenv.config();

// Initialize Google Cloud Storage with decrypted credentials
console.log('Google Cloud Storage initializing with project ID:', process.env.KEY_PASSWORD);
const credentials = process.env.KEY_PASSWORD ? 
  decryptServiceAccountKeyInMemory(
    path.resolve(__dirname, 'service-account.enc')
  ) : undefined;

logger.info('Google Cloud Storage initializing with:', {
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  bucket: process.env.GOOGLE_CLOUD_BUCKET,
  hasCredentials: !!credentials
});

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials: credentials, // Use decrypted credentials instead of keyFilename
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET || '');

// Configure Multer
const multerStorage = multer.memoryStorage();

// File filter to allow only images
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: Function) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WEBP are allowed.'), false);
  }
};

// Configure multer for avatar upload
export const avatarUpload = multer({
  storage: multerStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB limit
  },
}).single('avatar');

// Function to upload file to Google Cloud Storage
export async function uploadToGCS(file: Express.Multer.File): Promise<string> {
  try {
    const fileName = `avatars/${crypto.randomUUID()}${path.extname(file.originalname)}`;
    const blob = bucket.file(fileName);
    
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => {
        logger.error('Failed to upload file to GCS', { error: err });
        reject(err);
      });

      blobStream.on('finish', async () => {
        // Make the file public
        await blob.makePublic();
        
        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    });
  } catch (error) {
    logger.error('Error in uploadToGCS', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}