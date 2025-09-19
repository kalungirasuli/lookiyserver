import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import sql from '../utils/db';
import { ConnectionRequest, Connection } from '../models/database';
import logger from '../utils/logger';
import { cacheGet, cacheSet, cacheDelete, cacheInvalidatePattern } from '../utils/redis';
import { kafkaService, KafkaTopics } from '../utils/kafka';
import { getSocketService } from '../utils/socket';

function isValidUUID(uuid: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

async function emitConnectionEvent(type: string, networkId: string, data: any, userId?: string) {
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitToNetwork(networkId, type, data);
    if (userId) {
      socketService.emitToUser(userId, type, data);
    }
  }
}

interface SendConnectionRequestBody {
  message?: string;
}

export async function sendConnectionRequest(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId, userId: targetUserId } = req.params;
    const senderId = req.user!.id;
    const { message } = req.body as SendConnectionRequestBody;

    if (!isValidUUID(networkId) || !isValidUUID(targetUserId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    if (senderId === targetUserId) {
      return res.status(400).json({ error: 'Cannot send connection request to yourself' });
    }

    // Check if both users are members of the network
    const members = await sql`
      SELECT user_id FROM network_members 
      WHERE network_id = ${networkId} 
      AND user_id IN (${senderId}, ${targetUserId})
    `;

    if (members.length !== 2) {
      return res.status(403).json({ error: 'Both users must be members of the network' });
    }

    // Check if connection already exists
    const existingConnection = await sql<Connection[]>`
      SELECT * FROM connections 
      WHERE network_id = ${networkId}
      AND ((user_id_1 = ${senderId} AND user_id_2 = ${targetUserId})
           OR (user_id_1 = ${targetUserId} AND user_id_2 = ${senderId}))
    `;

    if (existingConnection.length > 0) {
      return res.status(400).json({ error: 'Connection already exists' });
    }

    // Check if connection request already exists
    const existingRequest = await sql<ConnectionRequest[]>`
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
    const targetUser = await sql`
      SELECT connection_request_privacy, isverified FROM users 
      WHERE id = ${targetUserId}
    `;

    if (targetUser.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const targetPrivacy = targetUser[0].connection_request_privacy;
    const targetIsVerified = targetUser[0].isverified;

    // Get sender's verification status
    const senderUser = await sql`
      SELECT isverified FROM users WHERE id = ${senderId}
    `;
    const senderIsVerified = senderUser[0]?.isverified || false;

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
    const connectionRequest = await sql<ConnectionRequest[]>`
      INSERT INTO connection_requests (
        from_user_id, to_user_id, network_id, message, status, created_at
      ) VALUES (
        ${senderId}, ${targetUserId}, ${networkId}, ${message || ''}, 'pending', NOW()
      ) RETURNING *
    `;

    // Get sender info for notification
    const senderInfo = await sql`
      SELECT u.id, u.username, u.display_name, u.avatar_url
      FROM users u
      WHERE u.id = ${senderId}
    `;

    // Emit connection request event
    await emitConnectionEvent('connection_request_sent', networkId, {
      requestId: connectionRequest[0].id,
      sender: senderInfo[0],
      receiverId: targetUserId,
      message: message || ''
    }, targetUserId);

    // Send Kafka notification
    await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
      type: 'connection_request',
      userId: targetUserId,
      data: {
        requestId: connectionRequest[0].id,
        sender: senderInfo[0],
        networkId,
        message: message || ''
      }
    });

    logger.info('Connection request sent', {
      requestId: connectionRequest[0].id,
      senderId,
      receiverId: targetUserId,
      networkId
    });

    res.status(201).json({
      message: 'Connection request sent successfully',
      request: connectionRequest[0]
    });
  } catch (error) {
    logger.error('Error sending connection request:', error);
    res.status(500).json({ error: 'Failed to send connection request' });
  }
}

export async function getConnectionRequests(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId } = req.params;
    const userId = req.user!.id;
    const { type = 'received' } = req.query;

    if (!isValidUUID(networkId)) {
      return res.status(400).json({ error: 'Invalid network ID format' });
    }

    // Check if user is member of the network
    const member = await sql`
      SELECT * FROM network_members 
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;

    if (member.length === 0) {
      return res.status(403).json({ error: 'Not a member of this network' });
    }

    let requests;
    if (type === 'sent') {
      requests = await sql`
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
    } else {
      requests = await sql`
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
  } catch (error) {
    logger.error('Error fetching connection requests:', error);
    res.status(500).json({ error: 'Failed to fetch connection requests' });
  }
}

interface RespondToRequestBody {
  action: 'accept' | 'reject';
}

export async function respondToConnectionRequest(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId, requestId } = req.params;
    const userId = req.user!.id;
    const { action } = req.body as RespondToRequestBody;

    if (!isValidUUID(networkId) || !isValidUUID(requestId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or reject' });
    }

    // Get the connection request
    const request = await sql<ConnectionRequest[]>`
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
      await sql.begin(async sql => {
        // Update request status
        await sql`
          UPDATE connection_requests 
          SET status = 'accepted', responded_at = NOW()
          WHERE id = ${requestId}
        `;

        // Create bidirectional connection
        await sql`
          INSERT INTO connections (
            user_id_1, user_id_2, network_id, connected_at
          ) VALUES 
          (${connectionRequest.from_user_id}, ${connectionRequest.to_user_id}, ${networkId}, NOW()),
          (${connectionRequest.to_user_id}, ${connectionRequest.from_user_id}, ${networkId}, NOW())
        `;
      });

      // Get user info for notifications
      const [senderInfo, receiverInfo] = await Promise.all([
        sql`SELECT id, username, display_name, avatar_url FROM users WHERE id = ${connectionRequest.from_user_id}`,
        sql`SELECT id, username, display_name, avatar_url FROM users WHERE id = ${connectionRequest.to_user_id}`
      ]);

      // Emit connection accepted event
      await emitConnectionEvent('connection_accepted', networkId, {
        requestId,
        sender: senderInfo[0],
        receiver: receiverInfo[0]
      });

      // Send Kafka notifications
      await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
        type: 'connection_accepted',
        userId: connectionRequest.from_user_id,
        data: {
          requestId,
          acceptedBy: receiverInfo[0],
          networkId
        }
      });

      logger.info('Connection request accepted', {
        requestId,
        senderId: connectionRequest.from_user_id,
        receiverId: connectionRequest.to_user_id,
        networkId
      });

      res.json({ message: 'Connection request accepted successfully' });
    } else {
      // Reject request
      await sql`
        UPDATE connection_requests 
        SET status = 'rejected', responded_at = NOW()
        WHERE id = ${requestId}
      `;

      // Emit connection rejected event
      await emitConnectionEvent('connection_rejected', networkId, {
        requestId,
        senderId: connectionRequest.from_user_id,
        receiverId: connectionRequest.to_user_id
      });

      logger.info('Connection request rejected', {
        requestId,
        senderId: connectionRequest.from_user_id,
        receiverId: connectionRequest.to_user_id,
        networkId
      });

      res.json({ message: 'Connection request rejected successfully' });
    }
  } catch (error) {
    logger.error('Error responding to connection request:', error);
    res.status(500).json({ error: 'Failed to respond to connection request' });
  }
}

export async function getConnections(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId } = req.params;
    const userId = req.user!.id;

    if (!isValidUUID(networkId)) {
      return res.status(400).json({ error: 'Invalid network ID format' });
    }

    // Check if user is member of the network
    const member = await sql`
      SELECT * FROM network_members 
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;

    if (member.length === 0) {
      return res.status(403).json({ error: 'Not a member of this network' });
    }

    // Get connections
    const connections = await sql`
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
  } catch (error) {
    logger.error('Error fetching connections:', error);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
}

interface SaveConnectionBody {
  saved: boolean;
}

export async function saveConnection(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId, connectionId } = req.params;
    const userId = req.user!.id;
    const { saved } = req.body as SaveConnectionBody;

    if (!isValidUUID(networkId) || !isValidUUID(connectionId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // Check if connection exists and belongs to user
    const connection = await sql<Connection[]>`
      SELECT * FROM connections 
      WHERE id = ${connectionId}
      AND network_id = ${networkId}
      AND (user_id_1 = ${userId} OR user_id_2 = ${userId})
    `;

    if (connection.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Update saved status
    await sql`
      UPDATE connections 
      SET saved = ${saved}, updated_at = NOW()
      WHERE id = ${connectionId}
    `;

    logger.info('Connection save status updated', {
      connectionId,
      userId,
      networkId,
      saved
    });

    res.json({ message: 'Connection save status updated successfully' });
  } catch (error) {
    logger.error('Error updating connection save status:', error);
    res.status(500).json({ error: 'Failed to update connection save status' });
  }
}

export async function removeConnection(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId, connectionId } = req.params;
    const userId = req.user!.id;

    if (!isValidUUID(networkId) || !isValidUUID(connectionId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // Get connection details
    const connection = await sql<Connection[]>`
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
    await sql.begin(async sql => {
      await sql`
        DELETE FROM connections 
        WHERE network_id = ${networkId}
        AND ((user_id_1 = ${userId} AND user_id_2 = ${connectedUserId})
             OR (user_id_1 = ${connectedUserId} AND user_id_2 = ${userId}))
      `;
    });

    // Emit connection removed event
    await emitConnectionEvent('connection_removed', networkId, {
      removedBy: userId,
      connectionId,
      connectedUserId
    });

    logger.info('Connection removed', {
      connectionId,
      userId,
      connectedUserId,
      networkId
    });

    res.json({ message: 'Connection removed successfully' });
  } catch (error) {
    logger.error('Error removing connection:', error);
    res.status(500).json({ error: 'Failed to remove connection' });
  }
}