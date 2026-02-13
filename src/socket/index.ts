import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { verifyToken } from '../utils/jwt.js'
import { JwtPayload } from '../middleware/authMiddleware.js'
import { prisma } from '../config/database.js'
import { handleMessages } from './handlers/messageHandler.js'
import { handleSignaling } from './handlers/signalingHandler.js'

export interface AuthenticatedSocket extends Socket {
  userId: string
  email: string
}

export function setupSocket(httpServer: HttpServer) {
  // Origens permitidas em desenvolvimento
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    process.env.CORS_ORIGIN || '',
  ].filter(Boolean)

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const payload = verifyToken(token) as JwtPayload
      ;(socket as AuthenticatedSocket).userId = payload.userId
      ;(socket as AuthenticatedSocket).email = payload.email
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket
    console.log(`User connected: ${authSocket.userId}`)

    // Join personal room
    authSocket.join(`user:${authSocket.userId}`)

    // Update online status
    await prisma.user.update({
      where: { id: authSocket.userId },
      data: { isOnline: true },
    })

    // Notify others that user is online
    socket.broadcast.emit('presence:update', {
      userId: authSocket.userId,
      isOnline: true,
    })

    // Register handlers
    handleMessages(io, authSocket)
    handleSignaling(io, authSocket)

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${authSocket.userId}`)

      await prisma.user.update({
        where: { id: authSocket.userId },
        data: { isOnline: false, lastSeen: new Date() },
      })

      socket.broadcast.emit('presence:update', {
        userId: authSocket.userId,
        isOnline: false,
        lastSeen: new Date(),
      })
    })

    // Join conversation room
    socket.on('room:join', (conversationId: string) => {
      authSocket.join(`conversation:${conversationId}`)
      console.log(`User ${authSocket.userId} joined room: ${conversationId}`)
    })

    // Leave conversation room
    socket.on('room:leave', (conversationId: string) => {
      authSocket.leave(`conversation:${conversationId}`)
    })

    // Handle typing indicator
    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:update', {
        conversationId,
        userId: authSocket.userId,
        isTyping: true,
      })
    })

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:update', {
        conversationId,
        userId: authSocket.userId,
        isTyping: false,
      })
    })
  })

  return io
}
