import jwt from 'jsonwebtoken';
import logger from './logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1d';

interface TokenPayload {
  userId: string;
  email: string;
  sessionId: string;
  roles?: string[];
}

export function generateToken(payload: TokenPayload): string {
  try {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  } catch (error) {
    logger.error('Token generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: payload.userId
    });
    throw error;
  }
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    logger.error('Token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}