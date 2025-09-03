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
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const auth_1 = __importDefault(require("./routes/auth"));
const networks_1 = __importDefault(require("./routes/networks"));
const recommendations_1 = __importDefault(require("./routes/recommendations"));
const connections_1 = __importDefault(require("./routes/connections"));
const crossNetworks_1 = __importDefault(require("./routes/crossNetworks"));
const body_parser_1 = __importDefault(require("body-parser"));
const process_1 = __importDefault(require("process"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = __importDefault(require("./utils/logger"));
const migrations_1 = require("./utils/migrations");
const scheduler_1 = require("./utils/scheduler");
const socket_1 = require("./utils/socket");
const sockets_1 = require("./sockets");
const auth_2 = require("./middleware/auth");
const path_1 = __importDefault(require("path"));
const kafka_1 = require("./utils/kafka");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const port = process_1.default.env.PORT || 3000;
// Initialize Socket.IO
(0, sockets_1.initializeSockets)(server);
// initializeSocketService(server)
// Initialize Kafka
kafka_1.kafkaService.initialize()
    .then(() => logger_1.default.info('Kafka service initialized'))
    .catch(err => logger_1.default.error('Failed to initialize Kafka service', { error: err instanceof Error ? err.message : 'Unknown error' }));
// Serve static files from public directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger_1.default.info('Request processed', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip
        });
    });
    next();
});
// Error logging middleware
app.use((err, req, res, next) => {
    logger_1.default.error('Server error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });
    res.status(500).json({ message: 'Internal server error' });
});
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)({
    origin: process_1.default.env.FRONTEND_URL || "*", //'http://localhost:3001',
    credentials: true,
}));
app.get('/', (req, res) => {
    logger_1.default.info('Health check endpoint accessed');
    res.send('Am a live 👌🏾...');
});
app.use('/V1/auth', auth_1.default);
app.use('/V1/networks', networks_1.default);
app.use('/V1/recommendations', recommendations_1.default);
app.use('/V1/connections', connections_1.default);
app.use('/V1/cross-networks', crossNetworks_1.default);
// WebSocket test endpoints
app.get('/V1/socket-docs', (req, res) => {
    res.json({
        description: 'WebSocket Events Documentation',
        connection: {
            url: `${process_1.default.env.FRONTEND_URL || 'http://localhost:3001'}`,
            auth: {
                token: 'JWT token from /V1/auth/login'
            }
        },
        events: {
            emit: {
                'join:network': {
                    description: 'Join a network room to receive updates',
                    data: 'networkId: string'
                },
                'leave:network': {
                    description: 'Leave a network room',
                    data: 'networkId: string'
                }
            },
            listen: {
                'network:update': {
                    description: 'Network update events',
                    data: {
                        type: 'string',
                        networkId: 'string',
                        data: 'object'
                    }
                },
                'network:activity': {
                    description: 'Network activity events (role changes, member updates, etc)',
                    data: {
                        type: 'string',
                        networkId: 'string',
                        userId: 'string',
                        data: 'object'
                    }
                },
                'join:request': {
                    description: 'New join request (admins only)',
                    data: {
                        networkId: 'string',
                        userId: 'string',
                        requestId: 'string'
                    }
                },
                'join:status': {
                    description: 'Join request status update',
                    data: {
                        type: 'string',
                        networkId: 'string',
                        status: 'string'
                    }
                },
                'notification': {
                    description: 'User notifications',
                    data: {
                        type: 'string',
                        title: 'string',
                        message: 'string'
                    }
                },
                'user:status': {
                    description: 'User online/offline status updates',
                    data: {
                        userId: 'string',
                        status: '"online" | "offline"'
                    }
                }
            }
        },
        testEndpoints: {
            'POST /V1/socket-test/emit': {
                description: 'Test emitting events to connected clients',
                auth: 'Requires JWT token',
                body: {
                    event: 'string (event name)',
                    data: 'object (event data)',
                    target: {
                        type: '"user" | "network" | "network-admins"',
                        id: 'string'
                    }
                }
            }
        }
    });
});
// Socket test endpoint for emitting events
app.post('/V1/socket-test/emit', auth_2.authenticate, (req, res) => {
    const { event, data, target } = req.body;
    const socketService = (0, socket_1.getSocketService)();
    try {
        switch (target.type) {
            case 'user':
                socketService.emitToUser(target.id, event, data);
                break;
            case 'network':
                socketService.emitToNetwork(target.id, event, data);
                break;
            case 'network-admins':
                socketService.emitToNetworkAdmins(target.id, event, data);
                break;
            default:
                return res.status(400).json({ message: 'Invalid target type' });
        }
        res.json({ message: 'Event emitted successfully' });
    }
    catch (error) {
        res.status(500).json({
            message: 'Failed to emit event',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, migrations_1.runMigrations)();
            (0, scheduler_1.startScheduledJobs)();
            server.listen(port, () => {
                logger_1.default.info(`Server started and listening at http://localhost:${port}`);
            });
        }
        catch (error) {
            logger_1.default.error('Failed to start server', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            process_1.default.exit(1);
        }
    });
}
// Graceful shutdown
process_1.default.on('SIGTERM', () => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.default.info('SIGTERM received. Starting graceful shutdown...');
    yield kafka_1.kafkaService.disconnect();
    server.close(() => {
        logger_1.default.info('HTTP server closed');
        process_1.default.exit(0);
    });
}));
startServer();
