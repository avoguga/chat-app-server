import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import routes from './routes/index.js'
import { setupSocket } from './socket/index.js'

const app = express()
const httpServer = createServer(app)

// Middleware
app.use(helmet())

// CORS - permite múltiplas origens em desenvolvimento
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  env.CORS_ORIGIN,
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requests sem origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin) || env.NODE_ENV === 'development') {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  })
)
app.use(express.json())

// Routes
app.use('/api', routes)

// Error handling
app.use(errorHandler)

// Socket.io
const io = setupSocket(httpServer)

// Export for use in handlers
export { io }

// Start server
httpServer.listen(env.PORT, () => {
  console.log(`
  ====================================
  🚀 Server running on port ${env.PORT}
  📦 Environment: ${env.NODE_ENV}
  ====================================
  `)
})
