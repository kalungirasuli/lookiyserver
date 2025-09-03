"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendConnectionRequest = sendConnectionRequest;
exports.getConnectionRequests = getConnectionRequests;
exports.respondToConnectionRequest = respondToConnectionRequest;
exports.getConnections = getConnections;
exports.saveConnection = saveConnection;
exports.removeConnection = removeConnection;
const db_1 = __importDefault(require("../utils/db"));
const logger_1 = __importDefault(require("../utils/logger"));
const kafka_1 = require("../utils/kafka");
const socket_1 = require("../utils/socket");
function isValidUUID(uuid) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}
function emitConnectionEvent(type, networkId, data, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const socketService = (0, socket_1.getSocketService)();
        if (socketService) {
            socketService.emitToNetwork(networkId, type, data);
            if (userId) {
                socketService.emitToUser(userId, type, data);
            }
        }
    });
}
function sendConnectionRequest(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { networkId, userId: targetUserId } = req.params;
            const senderId = req.user.id;
            const { message } = req.body;
            if (!isValidUUID(networkId) || !isValidUUID(targetUserId)) {
                return res.status(400).json({ error: 'Invalid ID format' });
            }
            if (senderId === targetUserId) {
                return res.status(400).json({ error: 'Cannot send connection request to yourself' });
            }
            // Check if both users are members of the network
            const members = yield (0, db_1.default) `
      SELECT user_id FROM network_members 
      WHERE network_id = ${networkId} 
      AND user_id IN (${senderId}, ${targetUserId})
    `;
            if (members.length !== 2) {
                return res.status(403).json({ error: 'Both users must be members of the network' });
            }
            // Check if connection already exists
            const existingConnection = yield (0, db_1.default) `
      SELECT * FROM connections 
      WHERE network_id = ${networkId}
      AND ((user_id_1 = ${senderId} AND user_id_2 = ${targetUserId})
           OR (user_id_1 = ${targetUserId} AND user_id_2 = ${senderId}))
    `;
            if (existingConnection.length > 0) {
                return res.status(400).json({ error: 'Connection already exists' });
            }
            // Check if connection request already exists
            const existingRequest = yield (0, db_1.default) `
      SELECT * FROM connection_requests 
      WHERE network_id = ${networkId}
      AND ((from_user_id = ${senderId} AND to_user_id = ${targetUserId})
           OR (from_user_id = ${targetUserId} AND to_user_id = ${senderId}))
      AND status = 'pending'
    `;
            if (existingRequest.length > 0) {
                return res.status(400).json({ error: 'Connection request already exists' });
            }
            // Check target user's connection request privacy settings
            const targetUser = yield (0, db_1.default) `
      SELECT connection_request_privacy, isverified FROM users 
      WHERE id = ${targetUserId}
    `;
            if (targetUser.length === 0) {
                return res.status(404).json({ error: 'Target user not found' });
            }
            const targetPrivacy = targetUser[0].connection_request_privacy;
            const targetIsVerified = targetUser[0].isverified;
            // Get sender's verification status
            const senderUser = yield (0, db_1.default) `
      SELECT isverified FROM users WHERE id = ${senderId}
    `;
            const senderIsVerified = ((_a = senderUser[0]) === null || _a === void 0 ? void 0 : _a.isverified) || false;
            // Check privacy restrictions
            switch (targetPrivacy) {
                case 'none':
                    return res.status(403).json({
                        error: 'This user is not accepting connection requests'
                    });
                case 'verified_only':
                    if (!senderIsVerified) {
                        return res.status(403).json({
                            error: 'This user only accepts connection requests from verified users'
                        });
                    }
                    break;
                case 'network_only':
                    // Already checked network membership above
                    break;
                case 'public':
                    // No additional restrictions
                    break;
                default:
                    // Default to network_only if privacy setting is invalid
                    break;
            }
            // Create connection request
            const connectionRequest = yield (0, db_1.default) `
      INSERT INTO connection_requests (
        from_user_id, to_user_id, network_id, message, status, created_at
      ) VALUES (
        ${senderId}, ${targetUserId}, ${networkId}, ${message || ''}, 'pending', NOW()
      ) RETURNING *
    `;
            // Get sender info for notification
            const senderInfo = yield (0, db_1.default) `
      SELECT u.id, u.username, u.display_name, u.avatar_url
      FROM users u
      WHERE u.id = ${senderId}
    `;
            // Emit connection request event
            yield emitConnectionEvent('connection_request_sent', networkId, {
                requestId: connectionRequest[0].id,
                sender: senderInfo[0],
                receiverId: targetUserId,
                message: message || ''
            }, targetUserId);
            // Send Kafka notification
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.NOTIFICATIONS, {
                type: 'connection_request',
                userId: targetUserId,
                data: {
                    requestId: connectionRequest[0].id,
                    sender: senderInfo[0],
                    networkId,
                    message: message || ''
                }
            });
            logger_1.default.info('Connection request sent', {
                requestId: connectionRequest[0].id,
                senderId,
                receiverId: targetUserId,
                networkId
            });
            res.status(201).json({
                message: 'Connection request sent successfully',
                request: connectionRequest[0]
            });
        }
        catch (error) {
            logger_1.default.error('Error sending connection request:', error);
            res.status(500).json({ error: 'Failed to send connection request' });
        }
    });
}
function getConnectionRequests(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { networkId } = req.params;
            const userId = req.user.id;
            const { type = 'received' } = req.query;
            if (!isValidUUID(networkId)) {
                return res.status(400).json({ error: 'Invalid network ID format' });
            }
            // Check if user is member of the network
            const member = yield (0, db_1.default) `
      SELECT * FROM network_members 
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;
            if (member.length === 0) {
                return res.status(403).json({ error: 'Not a member of this network' });
            }
            let requests;
            if (type === 'sent') {
                requests = yield (0, db_1.default) `
        SELECT cr.*, 
               u.username as receiver_username,
               u.display_name as receiver_display_name,
               u.avatar_url as receiver_avatar_url
        FROM connection_requests cr
        JOIN users u ON cr.to_user_id = u.id
        WHERE cr.network_id = ${networkId} 
        AND cr.from_user_id = ${userId}
        ORDER BY cr.created_at DESC
      `;
            }
            else {
                requests = yield (0, db_1.default) `
        SELECT cr.*, 
               u.username as sender_username,
               u.display_name as sender_display_name,
               u.avatar_url as sender_avatar_url
        FROM connection_requests cr
        JOIN users u ON cr.from_user_id = u.id
        WHERE cr.network_id = ${networkId} 
        AND cr.to_user_id = ${userId}
        ORDER BY cr.created_at DESC
      `;
            }
            res.json({ requests });
        }
        catch (error) {
            logger_1.default.error('Error fetching connection requests:', error);
            res.status(500).json({ error: 'Failed to fetch connection requests' });
        }
    });
}
function respondToConnectionRequest(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { networkId, requestId } = req.params;
            const userId = req.user.id;
            const { action } = req.body;
            if (!isValidUUID(networkId) || !isValidUUID(requestId)) {
                return res.status(400).json({ error: 'Invalid ID format' });
            }
            if (!['accept', 'reject'].includes(action)) {
                return res.status(400).json({ error: 'Action must be accept or reject' });
            }
            // Get the connection request
            const request = yield (0, db_1.default) `
      SELECT * FROM connection_requests 
      WHERE id = ${requestId} 
      AND network_id = ${networkId}
      AND to_user_id = ${userId}
      AND status = 'pending'
    `;
            if (request.length === 0) {
                return res.status(404).json({ error: 'Connection request not found or already processed' });
            }
            const connectionRequest = request[0];
            if (action === 'accept') {
                // Create connection in transaction
                yield db_1.default.begin((sql) => __awaiter(this, void 0, void 0, function* () {
                    // Update request status
                    yield sql `
          UPDATE connection_requests 
          SET status = 'accepted', responded_at = NOW()
          WHERE id = ${requestId}
        `;
                    // Create bidirectional connection
                    yield sql `
          INSERT INTO connections (
            user_id_1, user_id_2, network_id, connected_at
          ) VALUES 
          (${connectionRequest.from_user_id}, ${connectionRequest.to_user_id}, ${networkId}, NOW()),
          (${connectionRequest.to_user_id}, ${connectionRequest.from_user_id}, ${networkId}, NOW())
        `;
                }));
                // Get user info for notifications
                const [senderInfo, receiverInfo] = yield Promise.all([
                    (0, db_1.default) `SELECT id, username, display_name, avatar_url FROM users WHERE id = ${connectionRequest.from_user_id}`,
                    (0, db_1.default) `SELECT id, username, display_name, avatar_url FROM users WHERE id = ${connectionRequest.to_user_id}`
                ]);
                // Emit connection accepted event
                yield emitConnectionEvent('connection_accepted', networkId, {
                    requestId,
                    sender: senderInfo[0],
                    receiver: receiverInfo[0]
                });
                // Send Kafka notifications
                yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.NOTIFICATIONS, {
                    type: 'connection_accepted',
                    userId: connectionRequest.from_user_id,
                    data: {
                        requestId,
                        acceptedBy: receiverInfo[0],
                        networkId
                    }
                });
                logger_1.default.info('Connection request accepted', {
                    requestId,
                    senderId: connectionRequest.from_user_id,
                    receiverId: connectionRequest.to_user_id,
                    networkId
                });
                res.json({ message: 'Connection request accepted successfully' });
            }
            else {
                // Reject request
                yield (0, db_1.default) `
        UPDATE connection_requests 
        SET status = 'rejected', responded_at = NOW()
        WHERE id = ${requestId}
      `;
                // Emit connection rejected event
                yield emitConnectionEvent('connection_rejected', networkId, {
                    requestId,
                    senderId: connectionRequest.from_user_id,
                    receiverId: connectionRequest.to_user_id
                });
                logger_1.default.info('Connection request rejected', {
                    requestId,
                    senderId: connectionRequest.from_user_id,
                    receiverId: connectionRequest.to_user_id,
                    networkId
                });
                res.json({ message: 'Connection request rejected successfully' });
            }
        }
        catch (error) {
            logger_1.default.error('Error responding to connection request:', error);
            res.status(500).json({ error: 'Failed to respond to connection request' });
        }
    });
}
function getConnections(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { networkId } = req.params;
            const userId = req.user.id;
            if (!isValidUUID(networkId)) {
                return res.status(400).json({ error: 'Invalid network ID format' });
            }
            // Check if user is member of the network
            const member = yield (0, db_1.default) `
      SELECT * FROM network_members 
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;
            if (member.length === 0) {
                return res.status(403).json({ error: 'Not a member of this network' });
            }
            // Get connections
            const connections = yield (0, db_1.default) `
      SELECT c.*, 
             u.username, u.display_name, u.avatar_url, u.bio,
             nm.role as network_role
      FROM connections c
      JOIN users u ON (CASE WHEN c.user_id_1 = ${userId} THEN c.user_id_2 ELSE c.user_id_1 END) = u.id
      LEFT JOIN network_members nm ON u.id = nm.user_id AND nm.network_id = ${networkId}
      WHERE c.network_id = ${networkId} 
      AND (c.user_id_1 = ${userId} OR c.user_id_2 = ${userId})
      ORDER BY c.connected_at DESC
    `;
            res.json({ connections });
        }
        catch (error) {
            logger_1.default.error('Error fetching connections:', error);
            res.status(500).json({ error: 'Failed to fetch connections' });
        }
    });
}
function saveConnection(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { networkId, connectionId } = req.params;
            const userId = req.user.id;
            const { saved } = req.body;
            if (!isValidUUID(networkId) || !isValidUUID(connectionId)) {
                return res.status(400).json({ error: 'Invalid ID format' });
            }
            // Check if connection exists and belongs to user
            const connection = yield (0, db_1.default) `
      SELECT * FROM connections 
      WHERE id = ${connectionId}
      AND network_id = ${networkId}
      AND (user_id_1 = ${userId} OR user_id_2 = ${userId})
    `;
            if (connection.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }
            // Update saved status
            yield (0, db_1.default) `
      UPDATE connections 
      SET saved = ${saved}, updated_at = NOW()
      WHERE id = ${connectionId}
    `;
            logger_1.default.info('Connection save status updated', {
                connectionId,
                userId,
                networkId,
                saved
            });
            res.json({ message: 'Connection save status updated successfully' });
        }
        catch (error) {
            logger_1.default.error('Error updating connection save status:', error);
            res.status(500).json({ error: 'Failed to update connection save status' });
        }
    });
}
function removeConnection(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { networkId, connectionId } = req.params;
            const userId = req.user.id;
            if (!isValidUUID(networkId) || !isValidUUID(connectionId)) {
                return res.status(400).json({ error: 'Invalid ID format' });
            }
            // Get connection details
            const connection = yield (0, db_1.default) `
      SELECT * FROM connections 
      WHERE id = ${connectionId}
      AND network_id = ${networkId}
      AND (user_id_1 = ${userId} OR user_id_2 = ${userId})
    `;
            if (connection.length === 0) {
                return res.status(404).json({ error: 'Connection not found' });
            }
            const connectedUserId = connection[0].user_id_1 === userId ? connection[0].user_id_2 : connection[0].user_id_1;
            // Remove bidirectional connection
            yield db_1.default.begin((sql) => __awaiter(this, void 0, void 0, function* () {
                yield sql `
        DELETE FROM connections 
        WHERE network_id = ${networkId}
        AND ((user_id_1 = ${userId} AND user_id_2 = ${connectedUserId})
             OR (user_id_1 = ${connectedUserId} AND user_id_2 = ${userId}))
      `;
            }));
            // Emit connection removed event
            yield emitConnectionEvent('connection_removed', networkId, {
                removedBy: userId,
                connectionId,
                connectedUserId
            });
            logger_1.default.info('Connection removed', {
                connectionId,
                userId,
                connectedUserId,
                networkId
            });
            res.json({ message: 'Connection removed successfully' });
        }
        catch (error) {
            logger_1.default.error('Error removing connection:', error);
            res.status(500).json({ error: 'Failed to remove connection' });
        }
    });
}
