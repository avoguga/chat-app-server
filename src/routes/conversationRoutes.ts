import { Router } from 'express'
import {
  getConversations,
  getConversation,
  createConversation,
  getOrCreateDirectConversation,
} from '../controllers/conversationController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.use(authMiddleware)

router.get('/', getConversations)
router.post('/', createConversation)
router.get('/direct/:userId', getOrCreateDirectConversation)
router.get('/:id', getConversation)

export default router
