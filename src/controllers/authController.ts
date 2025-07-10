import { Request, Response } from 'express';
import sql from '../utils/db';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationEmail } from '../utils/email';
import { User } from '../models/user';
import logger from '../utils/logger';

interface RegisterRequestBody {
  name: string;
  email: string;
  password: string;
  description?: string;
  interests?: string[];
  isPublic?: boolean;
}

interface AuthResponse {
  message: string;
  error?: unknown;
}

interface VerifyEmailQuery {
  token: string;
}

export async function register(
  req: Request<{}, {}, RegisterRequestBody>,
  res: Response<AuthResponse>
) {
  const { name, email, password, description, interests, isPublic } = req.body;
  
  if (!name || !email || !password) {
    logger.warn('Registration attempt with missing fields', { email });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  logger.info('Starting user registration', { email });

  const hashedPassword = await bcrypt.hash(password, 10);
  const createdAt = new Date();
  const updatedAt = new Date();
  const isVerified = false;
  const avatar = null;

  try {
    await sql<User[]>`
      INSERT INTO users (
         name, email, password, description, interests, 
        avatar, is_Verified, is_Public, createdAt, updatedAt
      ) VALUES (
        ${name}, ${email}, ${hashedPassword}, ${description || null}, 
        ${interests ? JSON.stringify(interests) : null}, ${avatar}, ${isVerified}, 
        ${typeof isPublic === 'boolean' ? isPublic : false}, ${createdAt}, ${updatedAt}
      )
    `;
    
    logger.info('User registered successfully', { userId: id, email });
    
    const verificationToken = id;
    await sendVerificationEmail(email, verificationToken);
    logger.info('Verification email sent', { userId: id, email });
    
    res.status(201).json({ message: 'User registered. Please verify your email.' });
  } catch (err) {
    logger.error('Registration failed', { 
      email, 
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Registration failed', error: err });
  }
}

export async function verifyEmail(
  req: Request<{}, {}, {}, VerifyEmailQuery>,
  res: Response<AuthResponse>
) {
  const { token } = req.query;
  
  if (!token) {
    logger.warn('Email verification attempt without token');
    return res.status(400).json({ message: 'Missing token' });
  }

  logger.info('Starting email verification', { token });

  try {
    const result = await sql<User[]>`
      UPDATE users 
      SET isVerified = true 
      WHERE id = ${token} 
      RETURNING *
    `;
    
    if (result.count === 0) {
      logger.warn('Email verification failed - invalid token', { token });
      return res.status(400).json({ message: 'Invalid token' });
    }
    
    logger.info('Email verified successfully', { userId: token });
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    logger.error('Email verification failed', {
      token,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Verification failed', error: err });
  }
}