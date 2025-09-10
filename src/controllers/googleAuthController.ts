import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { GoogleOAuthService } from '../services/googleOAuthService';
import { 
  getGoogleAuthUrl, 
  exchangeCodeForTokens, 
  verifyGoogleToken 
} from '../config/googleOAuth';
import { sql } from '../utils/db';
import { User, GoogleUserTemp, GoogleRegistrationSteps } from '../models/database';
import { v4 as uuidv4 } from 'uuid';

// Import existing auth functions for 2FA and login alerts
import { 
  generateTwoFactorCode, 
  sendTwoFactorEmail, 
  logLoginAttempt,
  sendLoginAlert 
} from './authController';

interface GoogleAuthRequest extends Request {
  body: {
    idToken?: string;
    code?: string;
    registrationData?: {
      bio?: string;
      interests?: string[];
      location?: string;
      phone?: string;
      description?: string;
      isPublic?: boolean;
      connectionRequestPrivacy?: 'public' | 'network_only' | 'verified_only' | 'none';
    };
    step?: keyof GoogleRegistrationSteps;
    twoFactorCode?: string;
  };
}

// Get Google OAuth URL
export const getGoogleOAuthUrl = async (req: Request, res: Response) => {
  try {
    const authUrl = getGoogleAuthUrl();
    res.json({ 
      success: true, 
      authUrl,
      message: 'Google OAuth URL generated successfully' 
    });
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate Google OAuth URL' 
    });
  }
};

// Handle Google OAuth callback
export const handleGoogleCallback = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Authorization code is required' 
      });
    }

    // Exchange code for user info
    const googleUserInfo = await exchangeCodeForTokens(code);
    
    // Check if user already exists in main users table
    const existingUser = await GoogleOAuthService.findExistingGoogleUser(googleUserInfo.googleId);
    
    if (existingUser) {
      // User exists, proceed with login flow
      return await handleExistingGoogleUserLogin(existingUser, req, res);
    }

    // Check if email exists with regular account
    const emailUser = await GoogleOAuthService.findUserByEmail(googleUserInfo.email!);
    
    if (emailUser && !emailUser.is_google_user) {
      // Email exists but not a Google user - offer account linking
      return res.json({
        success: false,
        requiresLinking: true,
        message: 'An account with this email already exists. Please link your Google account.',
        email: googleUserInfo.email
      });
    }

    // New Google user - start registration process
    const tempUser = await GoogleOAuthService.createOrUpdateGoogleUserTemp({
      googleId: googleUserInfo.googleId,
      email: googleUserInfo.email!,
      name: googleUserInfo.name!,
      picture: googleUserInfo.picture
    });

    // Create registration state
    await GoogleOAuthService.getOrCreateRegistrationState(tempUser.id);

    res.json({
      success: true,
      requiresRegistration: true,
      tempUserId: tempUser.id,
      userInfo: {
        name: googleUserInfo.name,
        email: googleUserInfo.email,
        picture: googleUserInfo.picture
      },
      message: 'Please complete your registration'
    });

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Google authentication failed' 
    });
  }
};

// Handle direct Google ID token login
export const loginWithGoogleToken = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Google ID token is required' 
      });
    }

    // Verify Google ID token
    const googleUserInfo = await verifyGoogleToken(idToken);
    
    // Check if user exists
    const existingUser = await GoogleOAuthService.findExistingGoogleUser(googleUserInfo.googleId);
    
    if (existingUser) {
      return await handleExistingGoogleUserLogin(existingUser, req, res);
    }

    // New user flow (same as callback)
    const emailUser = await GoogleOAuthService.findUserByEmail(googleUserInfo.email!);
    
    if (emailUser && !emailUser.is_google_user) {
      return res.json({
        success: false,
        requiresLinking: true,
        message: 'An account with this email already exists. Please link your Google account.',
        email: googleUserInfo.email
      });
    }

    const tempUser = await GoogleOAuthService.createOrUpdateGoogleUserTemp({
      googleId: googleUserInfo.googleId,
      email: googleUserInfo.email!,
      name: googleUserInfo.name!,
      picture: googleUserInfo.picture
    });

    await GoogleOAuthService.getOrCreateRegistrationState(tempUser.id);

    res.json({
      success: true,
      requiresRegistration: true,
      tempUserId: tempUser.id,
      userInfo: {
        name: googleUserInfo.name,
        email: googleUserInfo.email,
        picture: googleUserInfo.picture
      },
      message: 'Please complete your registration'
    });

  } catch (error) {
    console.error('Google token login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Google authentication failed' 
    });
  }
};

// Handle existing Google user login with 2FA and alerts
const handleExistingGoogleUserLogin = async (user: User, req: Request, res: Response) => {
  try {
    // Log login attempt
    await logLoginAttempt(user.id, req.ip || 'unknown', 'google_oauth', true);

    // Generate 2FA code
    const twoFactorCode = generateTwoFactorCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store 2FA code
    await sql`
      INSERT INTO two_factor_codes (id, user_id, code, expires_at, created_at)
      VALUES (${uuidv4()}, ${user.id}, ${twoFactorCode}, ${expiresAt}, NOW())
    `;

    // Send 2FA email
    await sendTwoFactorEmail(user.email, twoFactorCode);

    // Send login alert
    await sendLoginAlert(user.email, {
      loginTime: new Date(),
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      loginMethod: 'Google OAuth'
    });

    res.json({
      success: true,
      requires2FA: true,
      userId: user.id,
      message: 'Please check your email for the 2FA verification code'
    });

  } catch (error) {
    console.error('Error in existing Google user login:', error);
    throw error;
  }
};

// Save registration step data
export const saveRegistrationStep = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { tempUserId } = req.params;
    const { registrationData, step } = req.body;

    if (!tempUserId || !step) {
      return res.status(400).json({ 
        success: false, 
        message: 'Temp user ID and step are required' 
      });
    }

    // Save the registration data
    if (registrationData) {
      const dataToSave: any = {};
      
      if (registrationData.bio) dataToSave.bio = registrationData.bio;
      if (registrationData.interests) dataToSave.interests = JSON.stringify(registrationData.interests);
      if (registrationData.location) dataToSave.location = registrationData.location;
      if (registrationData.phone) dataToSave.phone = registrationData.phone;
      if (registrationData.description) dataToSave.description = registrationData.description;
      if (registrationData.isPublic !== undefined) dataToSave.is_public = registrationData.isPublic;
      if (registrationData.connectionRequestPrivacy) {
        dataToSave.connection_request_privacy = registrationData.connectionRequestPrivacy;
      }

      await GoogleOAuthService.saveTempRegistrationData(tempUserId, dataToSave);
    }

    // Mark step as completed
    await GoogleOAuthService.updateRegistrationStep(tempUserId, step, true);

    // Get updated progress
    const progress = await GoogleOAuthService.getRegistrationProgress(tempUserId);

    res.json({
      success: true,
      progress,
      message: `${step} step completed successfully`
    });

  } catch (error) {
    console.error('Error saving registration step:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save registration step' 
    });
  }
};

// Get registration progress
export const getRegistrationProgress = async (req: Request, res: Response) => {
  try {
    const { tempUserId } = req.params;

    if (!tempUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Temp user ID is required' 
      });
    }

    const progress = await GoogleOAuthService.getRegistrationProgress(tempUserId);
    const tempData = await GoogleOAuthService.getTempRegistrationData(tempUserId);

    res.json({
      success: true,
      progress,
      savedData: tempData,
      message: 'Registration progress retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting registration progress:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get registration progress' 
    });
  }
};

// Complete Google user registration
export const completeGoogleRegistration = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { tempUserId } = req.params;

    if (!tempUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Temp user ID is required' 
      });
    }

    // Check if registration is complete
    const isComplete = await GoogleOAuthService.isRegistrationComplete(tempUserId);
    
    if (!isComplete) {
      const progress = await GoogleOAuthService.getRegistrationProgress(tempUserId);
      return res.status(400).json({ 
        success: false, 
        message: 'Registration is not complete',
        progress
      });
    }

    // Complete registration and move to main users table
    const newUser = await GoogleOAuthService.completeRegistration(tempUserId);

    // Generate 2FA code for the new user
    const twoFactorCode = generateTwoFactorCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await sql`
      INSERT INTO two_factor_codes (id, user_id, code, expires_at, created_at)
      VALUES (${uuidv4()}, ${newUser.id}, ${twoFactorCode}, ${expiresAt}, NOW())
    `;

    // Send 2FA email
    await sendTwoFactorEmail(newUser.email, twoFactorCode);

    // Send welcome login alert
    await sendLoginAlert(newUser.email, {
      loginTime: new Date(),
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      loginMethod: 'Google OAuth (First Login)'
    });

    // Log successful registration
    await logLoginAttempt(newUser.id, req.ip || 'unknown', 'google_oauth_registration', true);

    res.json({
      success: true,
      requires2FA: true,
      userId: newUser.id,
      message: 'Registration completed successfully! Please check your email for 2FA verification.'
    });

  } catch (error) {
    console.error('Error completing Google registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to complete registration' 
    });
  }
};

// Verify 2FA for Google users
export const verifyGoogleUser2FA = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { userId, twoFactorCode } = req.body;

    if (!userId || !twoFactorCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and 2FA code are required' 
      });
    }

    // Verify 2FA code
    const codeRecord = await sql`
      SELECT * FROM two_factor_codes 
      WHERE user_id = ${userId} AND code = ${twoFactorCode} AND expires_at > NOW()
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    if (codeRecord.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired 2FA code' 
      });
    }

    // Delete used 2FA code
    await sql`DELETE FROM two_factor_codes WHERE id = ${codeRecord[0].id}`;

    // Get user info
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    
    if (user.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user[0].id, 
        email: user[0].email,
        isGoogleUser: user[0].is_google_user 
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user[0].id,
        name: user[0].name,
        email: user[0].email,
        isGoogleUser: user[0].is_google_user,
        avatar: user[0].avatar,
        isVerified: user[0].isverified
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Error verifying Google user 2FA:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify 2FA code' 
    });
  }
};

// Link Google account to existing email account
export const linkGoogleAccount = async (req: GoogleAuthRequest, res: Response) => {
  try {
    const { email, password, idToken } = req.body;

    if (!email || !password || !idToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, password, and Google ID token are required' 
      });
    }

    // Verify Google token
    const googleUserInfo = await verifyGoogleToken(idToken);
    
    if (googleUserInfo.email !== email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Google account email does not match provided email' 
      });
    }

    // Verify existing account credentials
    const existingUser = await GoogleOAuthService.findUserByEmail(email);
    
    if (!existingUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Account not found' 
      });
    }

    // Verify password (import bcrypt for this)
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(password, existingUser.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }

    // Link Google account
    await sql`
      UPDATE users 
      SET google_id = ${googleUserInfo.googleId}, is_google_user = true, updated_at = NOW()
      WHERE id = ${existingUser.id}
    `;

    res.json({
      success: true,
      message: 'Google account linked successfully. You can now login with Google.'
    });

  } catch (error) {
    console.error('Error linking Google account:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to link Google account' 
    });
  }
};