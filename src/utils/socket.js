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
exports.initializeSocketService = initializeSocketService;
exports.broadcastUserStatus = broadcastUserStatus;
exports.emitToNetwork = emitToNetwork;
exports.emitToNetworkAdmins = emitToNetworkAdmins;
exports.emitToUser = emitToUser;
exports.getSocketService = getSocketService;
const socket_io_1 = require("socket.io");
const token_1 = require("./token");
const kafka_1 = require("./kafka");
const logger_1 = __importDefault(require("./logger"));
let io;
const userSockets = new Map();
const networkRooms = new Map();
const networkAdminRooms = new Map();
// Define public namespaces that don't require authentication
const PUBLIC_NAMESPACES = ['/network-search', '/public', '/guest'];
function initializeSocketService(server) {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN,
            methods: ['GET', 'POST']
        }
    });
    // Global middleware for authentication
    io.use((socket, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            // Skip authentication for public namespaces
            if (PUBLIC_NAMESPACES.includes(socket.nsp.name)) {
                return next();
            }
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication token required'));
            }
            const user = yield (0, token_1.verifyToken)(token);
            if (!user) {
                return next(new Error('Invalid token'));
            }
            socket.data.user = user;
            next();
        }
        catch (error) {
            logger_1.default.error('Socket authentication error:', error);
            next(new Error('Authentication error'));
        }
    }));
    // Handle authenticated connections
    io.on('connection', (socket) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Skip user tracking for public namespaces
        if (PUBLIC_NAMESPACES.includes(socket.nsp.name)) {
            return;
        }
        const userId = socket.data.user.id;
        // Handle duplicate connections
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        (_a = userSockets.get(userId)) === null || _a === void 0 ? void 0 : _a.add(socket.id);
        // Emit user online status
        broadcastUserStatus(userId, 'online');
        // Join networks handler
        socket.on('join_networks', (networkIds) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            for (const networkId of networkIds) {
                socket.join(`network:${networkId}`);
                if (!networkRooms.has(networkId)) {
                    networkRooms.set(networkId, new Set());
                }
                (_a = networkRooms.get(networkId)) === null || _a === void 0 ? void 0 : _a.add(socket.id);
                // Check if user is admin and add to admin room
                try {
                    const isAdmin = yield checkUserNetworkRole(userId, networkId, 'admin');
                    if (isAdmin) {
                        socket.join(`network:${networkId}:admins`);
                        if (!networkAdminRooms.has(networkId)) {
                            networkAdminRooms.set(networkId, new Set());
                        }
                        (_b = networkAdminRooms.get(networkId)) === null || _b === void 0 ? void 0 : _b.add(socket.id);
                    }
                }
                catch (error) {
                    logger_1.default.error('Error checking user network role:', error);
                }
            }
        }));
        socket.on('disconnect', () => {
            var _a, _b;
            // Remove socket from user tracking
            (_a = userSockets.get(userId)) === null || _a === void 0 ? void 0 : _a.delete(socket.id);
            if (((_b = userSockets.get(userId)) === null || _b === void 0 ? void 0 : _b.size) === 0) {
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
    }));
    // Subscribe to Kafka events
    subscribeToKafkaEvents();
    return io;
}
function subscribeToKafkaEvents() {
    try {
        // Network updates
        kafka_1.kafkaService.subscribe(kafka_1.KafkaTopics.NETWORK_UPDATES, (message) => __awaiter(this, void 0, void 0, function* () {
            const { type, networkId, userId, data } = message;
            emitToNetwork(networkId, 'network_event', { type, data });
        })).catch(error => {
            logger_1.default.warn('Failed to subscribe to network updates:', error);
        });
        // Join requests
        kafka_1.kafkaService.subscribe(kafka_1.KafkaTopics.JOIN_REQUESTS, (message) => __awaiter(this, void 0, void 0, function* () {
            const { networkId, userId, requestId, type } = message;
            emitToNetworkAdmins(networkId, 'join:request', { networkId, userId, requestId, type });
        })).catch(error => {
            logger_1.default.warn('Failed to subscribe to join requests:', error);
        });
        // Notifications
        kafka_1.kafkaService.subscribe(kafka_1.KafkaTopics.NOTIFICATIONS, (message) => __awaiter(this, void 0, void 0, function* () {
            const { userId, type, title, message: notificationMessage } = message;
            emitToUser(userId, 'notification', { type, title, message: notificationMessage });
        })).catch(error => {
            logger_1.default.warn('Failed to subscribe to notifications:', error);
        });
        // Member updates
        kafka_1.kafkaService.subscribe(kafka_1.KafkaTopics.MEMBER_UPDATES, (message) => __awaiter(this, void 0, void 0, function* () {
            const { type, networkId, userId, data } = message;
            if (type === 'member:join') {
                emitToNetwork(networkId, 'member:join', Object.assign({ userId }, data));
            }
        })).catch(error => {
            logger_1.default.warn('Failed to subscribe to member updates:', error);
        });
        // User activity updates
        kafka_1.kafkaService.subscribe(kafka_1.KafkaTopics.USER_ACTIVITY, (message) => __awaiter(this, void 0, void 0, function* () {
            const { type, userId, data } = message;
            emitToUser(userId, `user:${type}`, data);
        })).catch(error => {
            logger_1.default.warn('Failed to subscribe to user activity:', error);
        });
    }
    catch (error) {
        logger_1.default.error('Failed to initialize Kafka subscriptions:', error);
    }
}
function checkUserNetworkRole(userId, networkId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        // Implement role check against database
        return true; // Replace with actual implementation
    });
}
function broadcastUserStatus(userId, status) {
    io.emit('user:status', { userId, status });
}
function emitToNetwork(networkId, event, data) {
    io.to(`network:${networkId}`).emit(event, data);
}
function emitToNetworkAdmins(networkId, event, data) {
    io.to(`network:${networkId}:admins`).emit(event, data);
}
function emitToUser(userId, event, data) {
    const userSocketIds = userSockets.get(userId);
    if (userSocketIds) {
        userSocketIds.forEach(socketId => {
            io.to(socketId).emit(event, data);
        });
    }
}
function getSocketService() {
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
