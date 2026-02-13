import { Router } from 'express'
import authRoutes from './authRoutes.js'
import userRoutes from './userRoutes.js'
import conversationRoutes from './conversationRoutes.js'
import uploadRoutes from './uploadRoutes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/conversations', conversationRoutes)
router.use('/upload', uploadRoutes)

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
