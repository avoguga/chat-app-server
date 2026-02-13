import { Router } from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { upload, uploadFile } from '../controllers/uploadController.js'

const router = Router()

router.post('/', authMiddleware, upload.single('file'), uploadFile)

export default router
