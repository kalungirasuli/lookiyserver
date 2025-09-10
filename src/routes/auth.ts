import { Router } from 'express';
import { 
  register, 
  verifyEmail, 
  loginCheck as login, 
  logout, 
  verifyLoginDevice,
  requestPasswordReset,
  resetPassword,
  requestAccountDeletion,
  recoverAccount,
  editProfile,
  getPrivacySettings,
  updatePrivacySettings
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { avatarUpload } from '../utils/storage';
import googleAuthRouter from './googleAuth';

const router = Router();

// Regular authentication routes
router.post('/register', register);
router.get('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/verify-login', verifyLoginDevice);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/delete-account', authenticate, requestAccountDeletion);
router.post('/recover-account', recoverAccount);
router.put('/profile', authenticate, avatarUpload, editProfile);
router.get('/privacy-settings', authenticate, getPrivacySettings);
router.put('/privacy-settings', authenticate, updatePrivacySettings);

// Google OAuth routes
router.use('/', googleAuthRouter);

export default router;