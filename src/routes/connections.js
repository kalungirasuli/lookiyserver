"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const connectionController_1 = require("../controllers/connectionController");
const router = (0, express_1.Router)();
// Connection requests
router.post('/:networkId/requests/:userId', auth_1.authenticate, connectionController_1.sendConnectionRequest);
router.get('/:networkId/requests', auth_1.authenticate, connectionController_1.getConnectionRequests);
router.put('/:networkId/requests/:requestId', auth_1.authenticate, connectionController_1.respondToConnectionRequest);
// Connections management
router.get('/:networkId/connections', auth_1.authenticate, connectionController_1.getConnections);
router.put('/:networkId/connections/:connectionId/save', auth_1.authenticate, connectionController_1.saveConnection);
router.delete('/:networkId/connections/:connectionId', auth_1.authenticate, connectionController_1.removeConnection);
exports.default = router;
