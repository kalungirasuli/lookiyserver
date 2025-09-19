import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  sendConnectionRequest,
  getConnectionRequests,
  respondToConnectionRequest,
  getConnections,
  saveConnection,
  removeConnection
} from '../controllers/connectionController';

const router = Router();

// Connection requests
router.post('/:networkId/requests/:userId', authenticate, sendConnectionRequest);
router.get('/:networkId/requests', authenticate, getConnectionRequests);
router.put('/:networkId/requests/:requestId', authenticate, respondToConnectionRequest);

// Connections management
router.get('/:networkId/connections', authenticate, getConnections);
router.put('/:networkId/connections/:connectionId/save', authenticate, saveConnection);
router.delete('/:networkId/connections/:connectionId', authenticate, removeConnection);

export default router;