import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { createNetwork, generateNetworkQR, getShareableLink, editNetwork } from '../controllers/networkController';
import { avatarUpload } from '../utils/storage';

const router = Router();

// Network creation route
router.post('/', authenticate, createNetwork);

// QR code generation
router.get('/:id/qr', generateNetworkQR);

// Get shareable link
router.get('/:id/share', getShareableLink);

// Edit network
router.put('/:id', authenticate, avatarUpload, editNetwork);

export default router;