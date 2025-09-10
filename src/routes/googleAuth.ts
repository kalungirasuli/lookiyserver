import { Router } from 'express';
import {
  getGoogleOAuthUrl,
  handleGoogleCallback,
  loginWithGoogleToken,
  saveRegistrationStep,
  getRegistrationProgress,
  completeGoogleRegistration,
  verifyGoogleUser2FA,
  linkGoogleAccount
} from '../controllers/googleAuthController';

const router = Router();

// Google OAuth URL generation
router.get('/google/url', getGoogleOAuthUrl);

// Google OAuth callback (for web flow)
router.post('/google/callback', handleGoogleCallback);

// Direct Google ID token login (for client-side integration)
router.post('/google/login', loginWithGoogleToken);

// Google user registration flow
router.get('/google/registration/:tempUserId/progress', getRegistrationProgress);
router.post('/google/registration/:tempUserId/step', saveRegistrationStep);
router.post('/google/registration/:tempUserId/complete', completeGoogleRegistration);

// 2FA verification for Google users
router.post('/google/verify-2fa', verifyGoogleUser2FA);

// Link Google account to existing email account
router.post('/google/link-account', linkGoogleAccount);

export default router;