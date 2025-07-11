import { Request, Response } from 'express';
import sql from '../utils/db';
import bcrypt from 'bcrypt';
import { sendVerificationEmail, sendLoginAlertEmail, sendAccountSuspensionEmail } from '../utils/email';
import { User, LoginAttempt, AccountSuspension } from '../models/database';
import logger from '../utils/logger';
import { UAParser } from 'ua-parser-js';
import { AuthResponse, DeviceInfo, LoginResponse } from '../types/auth';
import { generateToken, verifyToken } from '../utils/token';

interface RegisterRequestBody {
  name: string;
  email: string;
  password: string;
  description?: string;
  interests?: string[];
  isPublic?: boolean;
}

interface LoginRequestBody {
  email: string;
  password: string;
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
    const result = await sql<User[]>`
      INSERT INTO users (
        name, email, password, description, interests, 
        avatar, isVerified, isPublic, createdAt, updatedAt
      ) VALUES (
        ${name}, ${email}, ${hashedPassword}, ${description || null}, 
        ${interests ? JSON.stringify(interests) : null}, ${avatar}, ${isVerified}, 
        ${typeof isPublic === 'boolean' ? isPublic : false}, ${createdAt}, ${updatedAt}
      )
      RETURNING id
    `;
    
    const userId = result[0].id;
    logger.info('User registered successfully', { userId, email });
    
    await sendVerificationEmail(email, userId);
    logger.info('Verification email sent', { userId, email });
    
    res.status(201).json({ message: 'User registered. Please verify your email.'});
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
    console.log('result', result);
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

interface LoginResponseWithSuspension extends LoginResponse {
  suspensionExpiry?: Date;
}

async function checkLoginAttempts(userId: string): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const attempts = await sql<LoginAttempt[]>`
    SELECT *
    FROM login_attempts
    WHERE user_id = ${userId}
      AND attempted_at > ${twentyFourHoursAgo}
      AND is_successful = false
    ORDER BY attempted_at DESC
    LIMIT 3
  `;

  return attempts.length >= 3;
}

async function suspendAccount(userId: string, email: string, reason: string) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

  // Create suspension record
  await sql<AccountSuspension[]>`
    INSERT INTO account_suspensions (
      user_id, reason, expires_at
    ) VALUES (
      ${userId}, ${reason}, ${expiresAt}
    )
  `;

  // Deactivate all sessions
  await sql`
    UPDATE user_sessions
    SET is_active = false
    WHERE user_id = ${userId}
  `;

  // Send suspension notification
  await sendAccountSuspensionEmail(email, reason, expiresAt);

  logger.warn('Account suspended', { userId, reason, expiresAt });
}

async function isAccountSuspended(userId: string): Promise<Date | null> {
  const suspensions = await sql<AccountSuspension[]>`
    SELECT *
    FROM account_suspensions
    WHERE user_id = ${userId}
      AND expires_at > NOW()
    ORDER BY expires_at DESC
    LIMIT 1
  `;

  return suspensions.length > 0 ? suspensions[0].expires_at : null;
}

export async function login(
  req: Request<{}, {}, LoginRequestBody>,
  res: Response<LoginResponseWithSuspension>
) {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (!email || !password) {
    logger.warn('Login attempt with missing credentials');
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const users = await sql<User[]>`
      SELECT * FROM users WHERE email = ${email}
    `;

    if (users.length === 0) {
      logger.warn('Login attempt with non-existent email', { email });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    // Check for account suspension
    const suspensionExpiry = await isAccountSuspended(user.id);
    if (suspensionExpiry) {
      logger.warn('Login attempt on suspended account', { email });
      return res.status(403).json({ 
        message: 'Account is temporarily suspended',
        suspensionExpiry 
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    // Record the login attempt
    await sql`
      INSERT INTO login_attempts (
        user_id, ip_address, is_successful
      ) VALUES (
        ${user.id}, ${ipAddress}, ${isValidPassword}
      )
    `;

    if (!isValidPassword) {
      // Check if we should suspend the account
      if (await checkLoginAttempts(user.id)) {
        await suspendAccount(
          user.id, 
          user.email, 
          'Multiple failed login attempts detected'
        );
        return res.status(403).json({ 
          message: 'Account has been temporarily suspended due to multiple failed login attempts' 
        });
      }

      logger.warn('Login attempt with invalid password', { email });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isVerified) {
      logger.warn('Login attempt with unverified account', { email });
      return res.status(403).json({ message: 'Please verify your email first' });
    }

    const userAgent = req.headers['user-agent'] || '';
    const parser = new UAParser();
    parser.setUA(userAgent);
    
    const deviceInfo: DeviceInfo = {
      browser: parser.getBrowser(),
      os: parser.getOS(),
      device: parser.getDevice()
    };

    const deviceId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const sessions = await sql<{ id: string }[]>`
      INSERT INTO user_sessions (
        user_id, device_id, device_info, ip_address, expires_at
      ) VALUES (
        ${user.id}, 
        ${deviceId}, 
        ${JSON.stringify(deviceInfo)}, 
        ${ipAddress}, 
        ${expiresAt}
      )
      RETURNING id
    `;

    const sessionId = sessions[0].id;

    // Generate JWT with session info
    const token = generateToken({
      userId: user.id,
      email: user.email,
      sessionId
    });

    // Check for other active sessions
    const activeSessions = await sql`
      SELECT device_info, ip_address, created_at
      FROM user_sessions
      WHERE user_id = ${user.id}
        AND is_active = true
        AND id != ${sessionId}
    `;

    if (activeSessions.length > 0) {
      await sendLoginAlertEmail(
        user.email,
        deviceInfo,
        ipAddress,
        sessionId,
        user.id
      );
    }

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      deviceId,
      sessionId
    });
console.log('User logged in successfully', {
  message: 'Login successful',
  token,
  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    isVerified: user.isVerified
  }
});
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified
      }
    });
  } catch (err) {
    logger.error('Login failed', {
      email,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Login failed', error: err });
  }
}

export async function verifyLoginDevice(
  req: Request<{}, {}, {}, { token: string; userId: string; action: string }>,
  res: Response
) {
  const { token: sessionId, userId, action } = req.query;

  try {
    if (action === 'true') {
      // Approve device
      await sql`
        UPDATE user_sessions
        SET is_active = true
        WHERE id = ${sessionId}
          AND user_id = ${userId}
      `;
      logger.info('Device approved', { sessionId, userId });
      res.json({ message: 'Device approved successfully' });
    } else {
      // Reject device and suspend session
      await sql`
        UPDATE user_sessions
        SET is_active = false
        WHERE id = ${sessionId}
          AND user_id = ${userId}
      `;
      logger.info('Device rejected and session suspended', { sessionId, userId });
      res.json({ message: 'Device rejected and session suspended' });
    }
  } catch (err) {
    logger.error('Device verification failed', {
      sessionId,
      userId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Device verification failed', error: err });
  }
}

export async function logout(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded?.sessionId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Deactivate session
    await sql`
      UPDATE user_sessions
      SET is_active = false
      WHERE id = ${decoded.sessionId}
    `;

    logger.info('User logged out successfully', { 
      sessionId: decoded.sessionId,
      userId: decoded.userId 
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout failed', {
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Logout failed', error: err });
  }
}