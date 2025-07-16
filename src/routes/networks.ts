import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { createNetwork, generateNetworkQR, getShareableLink } from '../controllers/networkController';

const router = Router();

// Network creation route
router.post('/', authenticate, createNetwork);

// QR code generation
router.get('/:id/qr', generateNetworkQR);

// Get shareable link
router.get('/:id/share',getShareableLink);

export default router;