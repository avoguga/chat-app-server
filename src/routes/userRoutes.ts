import { Router } from 'express'
import { searchUsers, getUser } from '../controllers/userController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.use(authMiddleware)

router.get('/search', searchUsers)
router.get('/:id', getUser)

export default router
