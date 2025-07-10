import express, { Request, Response, NextFunction } from 'express'
import auth from './routes/auth'
import bodyParser from 'body-parser'
import process from 'process'
import cors from 'cors'
import dotenv from 'dotenv'
import logger from './utils/logger'
import { runMigrations } from './utils/migrations'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

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
  origin: 'http://localhost:3001',
  credentials: true,
}))

app.get('/', (req: Request, res: Response) => {
  logger.info('Health check endpoint accessed')
  res.send('Hello World!')
})

app.use('/V1/auth', auth)

async function startServer() {
  try {
    await runMigrations()
    app.listen(port, () => {
      logger.info(`Server started and listening at http://localhost:${port}`)
    })
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    process.exit(1)
  }
}

startServer()