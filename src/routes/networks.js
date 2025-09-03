"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const networkController_1 = require("../controllers/networkController");
const storage_1 = require("../utils/storage");
const router = (0, express_1.Router)();
// Network creation and management
router.post('/', auth_1.authenticate, networkController_1.createNetwork);
router.put('/:id', auth_1.authenticate, storage_1.avatarUpload, networkController_1.editNetwork);
router.put('/:id/passcode', auth_1.authenticate, networkController_1.updateNetworkPasscode);
router.post('/:id/suspend', auth_1.authenticate, networkController_1.suspendNetwork);
router.post('/:id/unsuspend', auth_1.authenticate, networkController_1.unsuspendNetwork);
// Network joining and invitations
router.post('/:id/join', auth_1.authenticate, networkController_1.joinNetwork);
router.post('/:id/request-join', auth_1.authenticate, networkController_1.requestJoin);
router.post('/:id/join-requests/:requestId', auth_1.authenticate, networkController_1.handleJoinRequest);
router.post('/:id/invitations', auth_1.authenticate, networkController_1.createInvitations);
// Member management
router.put('/:id/members/:userId/role', auth_1.authenticate, networkController_1.assignRole);
router.delete('/:id/members/:userId', auth_1.authenticate, networkController_1.removeMember);
router.post('/:id/members', auth_1.authenticate, networkController_1.approveMember);
router.get('/:id/members', auth_1.authenticate, networkController_1.getNetworkMembers);
// Admin management
router.post('/:id/admins/:userId', auth_1.authenticate, networkController_1.promoteToAdmin);
router.delete('/:id/admins/resign', auth_1.authenticate, networkController_1.resignAdmin);
// Goals management
router.get('/:id/goals', auth_1.authenticate, networkController_1.getNetworkGoals);
router.post('/:id/goals', auth_1.authenticate, networkController_1.createNetworkGoal);
router.put('/:id/goals/:goalId', auth_1.authenticate, networkController_1.updateNetworkGoal);
router.delete('/:id/goals/:goalId', auth_1.authenticate, networkController_1.deleteNetworkGoal);
router.post('/:id/goals/select', auth_1.authenticate, networkController_1.selectNetworkGoals);
// Network sharing
router.get('/:id/qr', networkController_1.generateNetworkQR);
router.get('/:id/share', networkController_1.getShareableLink);
exports.default = router;
