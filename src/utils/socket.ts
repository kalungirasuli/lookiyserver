import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from './token';
import { kafkaService, KafkaTopics } from './kafka';
import logger from './logger';

let io: Server;
const userSockets = new Map<string, Set<string>>();
const networkRooms = new Map<string, Set<string>>();
const networkAdminRooms = new Map<string, Set<string>>();

// Define public namespaces that don't require authentication
const PUBLIC_NAMESPACES = ['/network-search', '/public', '/guest'];

export function initializeSocketService(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      methods: ['GET', 'POST']
    }
  });

  // Global middleware for authentication
  io.use(async (socket, next) => {
    try {
      // Skip authentication for public namespaces
      if (PUBLIC_NAMESPACES.includes(socket.nsp.name)) {
        return next();
      }

      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }
      
      const user = await verifyToken(token);
      if (!user) {
        return next(new Error('Invalid token'));
      }
      
      socket.data.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  // Handle authenticated connections
  io.on('connection', async (socket) => {
    // Skip user tracking for public namespaces
    if (PUBLIC_NAMESPACES.includes(socket.nsp.name)) {
      return;
    }

    const userId = socket.data.user.id;
    
    // Handle duplicate connections
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)?.add(socket.id);

    // Emit user online status
    broadcastUserStatus(userId, 'online');

    // Join networks handler
    socket.on('join_networks', async (networkIds: string[]) => {
      for (const networkId of networkIds) {
        socket.join(`network:${networkId}`);
        if (!networkRooms.has(networkId)) {
          networkRooms.set(networkId, new Set());
        }
        networkRooms.get(networkId)?.add(socket.id);
        
        // Check if user is admin and add to admin room
        try {
          const isAdmin = await checkUserNetworkRole(userId, networkId, 'admin');
          if (isAdmin) {
            socket.join(`network:${networkId}:admins`);
            if (!networkAdminRooms.has(networkId)) {
              networkAdminRooms.set(networkId, new Set());
            }
            networkAdminRooms.get(networkId)?.add(socket.id);
          }
        } catch (error) {
          logger.error('Error checking user network role:', error);
        }
      }
    });

    socket.on('disconnect', () => {
      // Remove socket from user tracking
      userSockets.get(userId)?.delete(socket.id);
      if (userSockets.get(userId)?.size === 0) {
        userSockets.delete(userId);
        broadcastUserStatus(userId, 'offline');
      }
      
      // Clean up network rooms
      networkRooms.forEach((sockets, networkId) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          networkRooms.delete(networkId);
        }
      });

      // Clean up admin rooms
      networkAdminRooms.forEach((sockets, networkId) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          networkAdminRooms.delete(networkId);
        }
      });
    });
  });

  // Subscribe to Kafka events
  subscribeToKafkaEvents();
  
  return io;
}

function subscribeToKafkaEvents() {
  try {
    // Network updates
    kafkaService.subscribe(KafkaTopics.NETWORK_UPDATES, async (message) => {
      const { type, networkId, userId, data } = message;
      emitToNetwork(networkId, 'network_event', { type, data });
    }).catch(error => {
      logger.warn('Failed to subscribe to network updates:', error);
    });

    // Join requests
    kafkaService.subscribe(KafkaTopics.JOIN_REQUESTS, async (message) => {
      const { networkId, userId, requestId, type } = message;
      emitToNetworkAdmins(networkId, 'join:request', { networkId, userId, requestId, type });
    }).catch(error => {
      logger.warn('Failed to subscribe to join requests:', error);
    });

    // Notifications
    kafkaService.subscribe(KafkaTopics.NOTIFICATIONS, async (message) => {
      const { userId, type, title, message: notificationMessage } = message;
      emitToUser(userId, 'notification', { type, title, message: notificationMessage });
    }).catch(error => {
      logger.warn('Failed to subscribe to notifications:', error);
    });

    // Member updates
    kafkaService.subscribe(KafkaTopics.MEMBER_UPDATES, async (message) => {
      const { type, networkId, userId, data } = message;
      if (type === 'member:join') {
        emitToNetwork(networkId, 'member:join', { userId, ...data });
      }
    }).catch(error => {
      logger.warn('Failed to subscribe to member updates:', error);
    });

    // User activity updates
    kafkaService.subscribe(KafkaTopics.USER_ACTIVITY, async (message) => {
      const { type, userId, data } = message;
      emitToUser(userId, `user:${type}`, data);
    }).catch(error => {
      logger.warn('Failed to subscribe to user activity:', error);
    });
  } catch (error) {
    logger.error('Failed to initialize Kafka subscriptions:', error);
  }
}

async function checkUserNetworkRole(userId: string, networkId: string, role: string): Promise<boolean> {
  // Implement role check against database
  return true; // Replace with actual implementation
}

export function broadcastUserStatus(userId: string, status: 'online' | 'offline') {
  io.emit('user:status', { userId, status });
}

export function emitToNetwork(networkId: string, event: string, data: any) {
  io.to(`network:${networkId}`).emit(event, data);
}

export function emitToNetworkAdmins(networkId: string, event: string, data: any) {
  io.to(`network:${networkId}:admins`).emit(event, data);
}

export function emitToUser(userId: string, event: string, data: any) {
  const userSocketIds = userSockets.get(userId);
  if (userSocketIds) {
    userSocketIds.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  }
}

export function getSocketService() {
  if (!io) {
    throw new Error('Socket service not initialized');
  }
  return {
    io,
    emitToNetwork,
    emitToNetworkAdmins,
    emitToUser,
    broadcastUserStatus
  };
}