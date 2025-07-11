import { Router } from 'express';
import { register, verifyEmail, login, logout, verifyLoginDevice } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.get('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/verify-login', verifyLoginDevice);

export default router;