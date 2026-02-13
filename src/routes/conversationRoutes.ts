import { Router } from 'express'
import {
  getConversations,
  getConversation,
  createConversation,
  getOrCreateDirectConversation,
  createGroup,
  updateGroup,
  leaveGroup,
} from '../controllers/conversationController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.use(authMiddleware)

router.get('/', getConversations)
router.post('/', createConversation)
router.post('/group', createGroup)
router.put('/group/:id', updateGroup)
router.delete('/group/:id/leave', leaveGroup)
router.get('/direct/:userId', getOrCreateDirectConversation)
router.get('/:id', getConversation)

export default router
