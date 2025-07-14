import jwt from 'jsonwebtoken';
import logger from './logger';
import { decode } from 'punycode';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const TOKEN_EXPIRY = '28 days'; // 28 days for account deletion recovery

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
    const result=jwt.decode(token) as TokenPayload;
    const issuedAt = new Date(result.iat * 1000).toLocaleString();
    const expiresAt = new Date(result.exp * 1000).toLocaleString();
   
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    logger.error('Token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}