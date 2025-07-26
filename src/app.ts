import express, { Request, Response, NextFunction } from 'express'
import http from 'http'
import auth from './routes/auth'
import networks from './routes/networks'
import bodyParser from 'body-parser'
import process from 'process'
import cors from 'cors'
import dotenv from 'dotenv'
import logger from './utils/logger'
import { runMigrations } from './utils/migrations'
import { startScheduledJobs } from './utils/scheduler'
import {  getSocketService, initializeSocketService } from './utils/socket'
import { initializeSockets } from './sockets'
import { authenticate } from './middleware/auth'
import path from 'path'
import { kafkaService } from './utils/kafka'

dotenv.config()

const app = express()
const server = http.createServer(app)
const port = process.env.PORT || 3000

// Initialize Socket.IO
initializeSockets(server)
// initializeSocketService(server)

// Initialize Kafka
kafkaService.initialize()
  .then(() => logger.info('Kafka service initialized'))
  .catch(err => logger.error('Failed to initialize Kafka service', { error: err instanceof Error ? err.message : 'Unknown error' }))

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')))

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info('Request processed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    })
  })
  next()
})

// Error logging middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Server error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  })
  res.status(500).json({ message: 'Internal server error' })
})

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",//'http://localhost:3001',
  credentials: true,
}))

app.get('/', (req: Request, res: Response) => {
  logger.info('Health check endpoint accessed')
  res.send('Am a live 👌🏾...')
})

app.use('/V1/auth', auth)
app.use('/V1/networks', networks)

// WebSocket test endpoints
app.get('/V1/socket-docs', (req: Request, res: Response) => {
  res.json({
    description: 'WebSocket Events Documentation',
    connection: {
      url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}`,
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
  })
})

// Socket test endpoint for emitting events
app.post('/V1/socket-test/emit', authenticate, (req: Request, res: Response) => {
  const { event, data, target } = req.body
  const socketService = getSocketService()

  try {
    switch(target.type) {
      case 'user':
        socketService.emitToUser(target.id, event, data)
        break
      case 'network':
        socketService.emitToNetwork(target.id, event, data)
        break
      case 'network-admins':
        socketService.emitToNetworkAdmins(target.id, event, data)
        break
      default:
        return res.status(400).json({ message: 'Invalid target type' })
    }
    
    res.json({ message: 'Event emitted successfully' })
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to emit event',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

async function startServer() {
  try {
    await runMigrations()
    startScheduledJobs()
    server.listen(port, () => {
      logger.info(`Server started and listening at http://localhost:${port}`)
    })
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Starting graceful shutdown...')
  await kafkaService.disconnect();
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
})

startServer()