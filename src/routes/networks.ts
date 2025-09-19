import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  createNetwork, 
  generateNetworkQR, 
  getShareableLink, 
  editNetwork, 
  assignRole,
  removeMember,
  approveMember,
  promoteToAdmin,
  resignAdmin,
  createInvitations,
  joinNetwork,
  requestJoin,
  handleJoinRequest,
  createNetworkGoal,
  getNetworkGoals,
  updateNetworkGoal,
  deleteNetworkGoal,
  selectNetworkGoals,
  getNetworkMembers,
  updateNetworkPasscode,
  suspendNetwork,
  unsuspendNetwork
} from '../controllers/networkController';
import { avatarUpload } from '../utils/storage';

const router = Router();

// Network creation and management
router.post('/', authenticate, createNetwork);
router.put('/:id', authenticate, avatarUpload, editNetwork);
router.put('/:id/passcode', authenticate, updateNetworkPasscode);
router.post('/:id/suspend', authenticate, suspendNetwork);
router.post('/:id/unsuspend', authenticate, unsuspendNetwork);

// Network joining and invitations
router.post('/:id/join', authenticate, joinNetwork);
router.post('/:id/request-join', authenticate, requestJoin);
router.post('/:id/join-requests/:requestId', authenticate, handleJoinRequest);
router.post('/:id/invitations', authenticate, createInvitations);

// Member management
router.put('/:id/members/:userId/role', authenticate, assignRole);
router.delete('/:id/members/:userId', authenticate, removeMember);
router.post('/:id/members', authenticate, approveMember);
router.get('/:id/members', authenticate, getNetworkMembers);

// Admin management
router.post('/:id/admins/:userId', authenticate, promoteToAdmin);
router.delete('/:id/admins/resign', authenticate, resignAdmin);

// Goals management
router.get('/:id/goals', authenticate, getNetworkGoals);
router.post('/:id/goals', authenticate, createNetworkGoal);
router.put('/:id/goals/:goalId', authenticate, updateNetworkGoal);
router.delete('/:id/goals/:goalId', authenticate, deleteNetworkGoal);
router.post('/:id/goals/select', authenticate, selectNetworkGoals);

// Network sharing
router.get('/:id/qr', generateNetworkQR);
router.get('/:id/share', getShareableLink);

export default router;