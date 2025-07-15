import { Request, Response } from 'express';
import sql from '../utils/db';
import bcrypt from 'bcrypt';
import { sendVerificationEmail, sendLoginAlertEmail, sendAccountSuspensionEmail, sendPasswordResetEmail, sendAccountDeletionEmail, sendAccountRecoveredEmail, sendPermanentDeletionEmail } from '../utils/email';
import { User, LoginAttempt, AccountSuspension, DeletedAccount } from '../models/database';
import logger from '../utils/logger';
import { UAParser } from 'ua-parser-js';
import { AuthResponse, DeviceInfo, LoginResponse, } from '../types/auth';
import { AuthRequest } from '../middleware/auth';
import { generateToken, verifyToken } from '../utils/token';
import { uploadToGCS } from '../utils/storage';
import { generateAndUploadAvatar } from '../utils/avatar';

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

  try {
    // First create the user to get the ID
    const result = await sql<User[]>`
      INSERT INTO users (
        name, email, password, description, interests, 
        isVerified, isPublic, createdAt, updatedAt
      ) VALUES (
        ${name}, ${email}, ${hashedPassword}, ${description || null}, 
        ${interests ? JSON.stringify(interests) : null}, ${isVerified}, 
        ${typeof isPublic === 'boolean' ? isPublic : false}, ${createdAt}, ${updatedAt}
      )
      RETURNING id
    `;
    
    const userId = result[0].id;

    // Generate and upload default avatar
    try {
      const avatarUrl = await generateAndUploadAvatar(userId);
      await sql`
        UPDATE users
        SET avatar = ${avatarUrl}
        WHERE id = ${userId}
      `;
    } catch (avatarError) {
      logger.error('Failed to generate avatar', {
        userId,
        error: avatarError instanceof Error ? avatarError.message : 'Unknown error'
      });
      // Continue registration even if avatar generation fails
    }
    
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
// check if user exits
    
    const result = await sql<User[]>`
      UPDATE users 
      SET isVerified = true,
          updatedAt = NOW()
      WHERE id = ${token} 
        AND isVerified = false
      RETURNING *
    `;

    if (result.length === 0) {
      logger.warn('Email verification failed - invalid token or already verified', { token });
      return res.status(400).json({ message: 'Invalid token or email already verified' });
    }
    
    logger.info('Email verified successfully', { 
      userId: token, 
      email: result[0].email 
    });
    
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

async function login(
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

    // Check if email is verified - prevent login if not verified
    if (user.isverified=== false) {
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
    console.log('sessionId', {sessionId});
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

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.isverified
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

interface RequestPasswordResetBody {
  email: string;
}

interface ResetPasswordBody {
  Token: string;
  newPassword: string;
}

export async function requestPasswordReset(
  req: Request<{}, {}, RequestPasswordResetBody>,
  res: Response<AuthResponse>
) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const users = await sql<User[]>`
      SELECT * FROM users WHERE email = ${email}
    `;

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = users[0];
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    await sql`
      INSERT INTO password_reset_tokens (
        user_id, token, expires_at
      ) VALUES (
        ${user.id}, ${resetToken}, ${expiresAt}
      )
    `;

    // await sendPasswordResetEmail(email, resetToken);

    logger.info('Password reset requested', { userId: user.id, email,resetToken });
    
    res.json({ message: 'Password reset instructions sent to email'});
  } catch (err) {
    logger.error('Password reset request failed', {
      email,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    console.error('Password reset request error', err);
    res.status(500).json({ message: 'Failed to process password reset request' });
  }
}

export async function resetPassword(
  req: Request<{}, {}, ResetPasswordBody>,
  res: Response<AuthResponse>
) {
  console.log('Resetting password for token:', req.body);
  const { Token, newPassword } = req.body;
  

  if (!Token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  try {
    const resetTokens = await sql`
      SELECT user_id, used
      FROM password_reset_tokens
      WHERE token = ${Token}
        AND expires_at > NOW()
        AND used = false
    `;

    if (resetTokens.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const userId = resetTokens[0].user_id;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and mark token as used in a transaction
    await sql.begin(async sql => {
      await sql`
        UPDATE users
        SET password = ${hashedPassword}, 
            updatedAt = NOW()
        WHERE id = ${userId}
      `;

      await sql`
        UPDATE password_reset_tokens
        SET used = true
        WHERE token = ${Token}
      `;
    });

    logger.info('Password reset successful', { userId });
    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    logger.error('Password reset failed', {
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to reset password' });
  }
}

export async function requestAccountDeletion(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  console.log('Requesting account deletion for user:', {userId});
  try {
    const user = await sql<User[]>`
      SELECT * FROM users WHERE id = ${userId}
    `;
    console.log('User found:', {message:"getting user by id"});
    if (user.length === 0) {
      return res.status(404).json({ message: 'User not found' });
      console.log('User not found:', {message:"user not found"});
    }

    const now = new Date();
    const permanentDeletionDate = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000); // 28 days
    console.log('Setting up account deletion:', {message:"setting up account deletion"});
    const recoveryToken = crypto.randomUUID();
    console.log('Recovery token generated:', { recoveryToken });
    await sql.begin(async sql => {
      // Update user status
      await sql`
        UPDATE users 
        SET account_status = 'pending_deletion',
            deletion_requested_at = ${now}
        WHERE id = ${userId}
      `;

      // Create deletion record
      await sql`
        INSERT INTO deleted_accounts (
          user_id, deletion_requested_at, permanent_deletion_date,
          recovery_token, reason, is_permanent
        ) VALUES (
          ${userId}, ${now}, ${permanentDeletionDate},
          ${recoveryToken}, ${req.body.reason || null}, false
        )
      `;

      // Deactivate all sessions
      await sql`
        UPDATE user_sessions
        SET is_active = false
        WHERE user_id = ${userId}
      `;
    });
    console.log('Account deletion record created:', {message:"account deletion record created"});
    // await sendAccountDeletionEmail(user[0].email, recoveryToken);
    console.log('Account deletion email sent:', {message:"account deletion email sent"});
    logger.info('Account deletion requested', { 
      userId,
      permanentDeletionDate,
      recoveryToken
    });

    res.json({ 
      message: 'Account deletion requested. You have 28 days to recover your account.'
    });
  } catch (err) {
    logger.error('Account deletion request failed', {
      userId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to process deletion request' });
  }
}

export async function recoverAccount(
  req: Request<{}, {}, { token: string }>,
  res: Response
) {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Recovery token is required' });
  }

  try {
    const deletionRecords = await sql<DeletedAccount[]>`
      SELECT da.*, u.email
      FROM deleted_accounts da
      JOIN users u ON u.id = da.user_id
      WHERE da.recovery_token = ${token}
        AND da.is_permanent = false
        AND da.permanent_deletion_date > NOW()
    `;

    if (deletionRecords.length === 0) {
      return res.status(400).json({ 
        message: 'Invalid or expired recovery token' 
      });
    }

    const deletionRecord = deletionRecords[0];

    if (!deletionRecord.email) {
      logger.error('Email not found for deletion record', { userId: deletionRecord.user_id });
      return res.status(500).json({ message: 'Account recovery failed' });
    }

    await sql.begin(async sql => {
      // Reactivate user
      await sql`
        UPDATE users 
        SET account_status = 'active',
            deletion_requested_at = null
        WHERE id = ${deletionRecord.user_id}
      `;

      // Mark deletion record as recovered
      await sql`
        DELETE FROM deleted_accounts
        WHERE user_id = ${deletionRecord.user_id}
      `;
    });

    // await sendAccountRecoveredEmail(deletionRecord.email);

    logger.info('Account recovered successfully', { 
      userId: deletionRecord.user_id 
    });

    res.json({ message: 'Account recovered successfully' });
  } catch (err) {
    logger.error('Account recovery failed', {
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to recover account' });
  }
}

// Function to permanently delete expired accounts (should be run by a scheduled job)
export async function processPermanentDeletions() {
  try {
    const expiredAccounts = await sql<DeletedAccount[]>`
      SELECT da.*, u.email
      FROM deleted_accounts da
      JOIN users u ON u.id = da.user_id
      WHERE da.permanent_deletion_date <= NOW()
        AND da.is_permanent = false
    `;

    for (const account of expiredAccounts) {
      await sql.begin(async sql => {
        // Mark account as permanently deleted
        await sql`
          UPDATE deleted_accounts
          SET is_permanent = true
          WHERE user_id = ${account.user_id}
        `;

        // Update user status
        await sql`
          UPDATE users
          SET account_status = 'deleted',
              email = CONCAT('deleted_', ${account.user_id}, '_', email),
              password = NULL,
              name = 'Deleted User',
              description = NULL,
              interests = NULL,
              avatar = NULL
          WHERE id = ${account.user_id}
        `; 

        // Send email only if we have a valid email address
        if (account.email) {
          try {
            await sendPermanentDeletionEmail(account.email);
          } catch (emailError) {
            logger.error('Failed to send permanent deletion email', {
              userId: account.user_id,
              error: emailError instanceof Error ? emailError.message : 'Unknown error'
            });
            // Continue with deletion even if email fails
          }
        }
      });

      logger.info('Account permanently deleted', { 
        userId: account.user_id 
      });
    }
  } catch (err) {
    logger.error('Permanent deletion processing failed', {
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    throw err;
  }
}

// Login handler modification to check for deletion status
const existingLoginFunction = login;
export async function loginCheck(
  req: Request<{}, {}, LoginRequestBody>,
  res: Response<LoginResponseWithSuspension>
) {
  try {
    const { email } = req.body;
    const users = await sql<User[]>`
      SELECT * FROM users 
      WHERE email = ${email}
        AND account_status != 'deleted'
    `;

    if (users.length > 0) {
      const user = users[0];
      
      if (user.account_status === 'pending_deletion') {
        const deletionRecord = await sql<DeletedAccount[]>`
          SELECT * FROM deleted_accounts
          WHERE user_id = ${user.id}
            AND is_permanent = false
        `;

        if (deletionRecord.length > 0) {
          return res.status(403).json({
            message: 'Account pending deletion. Please check your email for recovery instructions.'
          });
        }
      }
    }

    return existingLoginFunction(req, res);
  } catch (err) {
    logger.error('Login check failed', {
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    return res.status(500).json({ message: 'Login failed' });
  }
}

interface EditProfileRequestBody {
  name?: string;
  description?: string;
  interests?: string[];
  isPublic?: boolean;
  avatar?: string;
  email?: string; 
}

export async function editProfile(
  req: AuthRequest,
  res: Response
) {
  console.log('Starting editProfile with request:', {
    body: req.body,
    file: req.file,
    userId: req.user?.id
  });

  const userId = req.user?.id;
  if (!userId) {
    console.log('Authentication failed - no userId found');
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    console.log('Fetching user from database:', { userId });
    // Verify user exists
    const users = await sql<User[]>`
      SELECT * FROM users WHERE id = ${userId}
    `;

    if (users.length === 0) {
      console.log('User not found in database:', { userId });
      return res.status(404).json({ message: 'User not found' });
    }

    const updates = [];
    const { name, description, interests, isPublic, email } = req.body?req.body:{};
    console.log('Processing update fields:', { name, description, interests, isPublic, email });
    
    // Handle file upload if present
    let avatarUrl: string | undefined;
    if (req.file) {
      console.log('Processing file upload:', { 
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype 
      })
      ;
      try {
        avatarUrl = await uploadToGCS(req.file);
        console.log('File upload successful:', { avatarUrl });
      } catch (error) {
        console.error('Avatar upload failed:', error);
        logger.error('Avatar upload failed', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return res.status(500).json({ message: 'Failed to upload avatar' });
      }
    }
    else {
      console.log('No file uploaded, skipping avatar update');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (name !== undefined) {
      console.log('Adding name update:', { name });
      updates.push(sql`"name" = ${name}`);
    }
    if (email !== undefined) {
      console.log('Adding email update:', { email });
      updates.push(sql`"email" = ${email}`);
    }
    if (description !== undefined) {
      console.log('Adding description update:', { description });
      updates.push(sql`"description" = ${description}`);
    }
    if (interests !== undefined) {
      console.log('Adding interests update:', { interests });
      updates.push(sql`"interests" = ${JSON.stringify(interests)}`);
    }
    if (isPublic !== undefined) {
      console.log('Adding isPublic update:', { isPublic });
      updates.push(sql`"ispublic" = ${isPublic}`);
    }
    if (avatarUrl !== undefined) {
      console.log('Adding avatar update:', { avatarUrl });
      updates.push(sql`"avatar" = ${avatarUrl}`);
    }

    // Always update updatedAt
    updates.push(sql`"updatedat" = NOW()`);

    if (updates.length === 0) {
      console.log('No fields to update');
      return res.status(400).json({ message: 'No fields to update' });
    }

    console.log('Preparing SQL update with fields:', { updateCount: updates.length });
    // Combine all updates with commas
    const updateClause = updates.reduce((acc, curr) => sql`${acc}, ${curr}`);

    console.log('Executing database update');
    const result = await sql<User[]>`
      UPDATE users
      SET ${updateClause}
      WHERE id = ${userId}
      RETURNING *
    `;

    console.log('Database update successful:', { 
      updatedFields: Object.keys(req.body),
      hasAvatar: !!avatarUrl 
    });

    logger.info('Profile updated successfully', { 
      userId,
      updatedFields: Object.keys(req.body),
      hasAvatar: !!avatarUrl
    });

    // Return updated user data (excluding sensitive fields)
    const { password, ...updatedUser } = result[0];
    console.log('Sending response with updated user data');
    res.json({ 
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (err) {
    console.error('Profile update failed:', err);
    logger.error('Profile update failed', {
      userId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to update profile' });
  }
}