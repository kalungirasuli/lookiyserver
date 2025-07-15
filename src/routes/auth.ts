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
  editProfile
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { avatarUpload } from '../utils/storage';

const router = Router();

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

export default router;