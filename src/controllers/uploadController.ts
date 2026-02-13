import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

// Criar pasta de uploads se não existir
const uploadDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Configuração do multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const filename = `${randomUUID()}${ext}`
    cb(null, filename)
  },
})

// Filtro de tipos de arquivo
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    // Imagens
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Videos
    'video/mp4',
    'video/webm',
    'video/quicktime',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    // Documentos
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`))
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
})

// Controller para upload de arquivo
export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    }

    const file = req.file
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const mediaUrl = `${baseUrl}/uploads/${file.filename}`

    // Determinar o tipo de mídia
    let mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' = 'FILE'
    if (file.mimetype.startsWith('image/')) {
      mediaType = 'IMAGE'
    } else if (file.mimetype.startsWith('video/')) {
      mediaType = 'VIDEO'
    } else if (file.mimetype.startsWith('audio/')) {
      mediaType = 'AUDIO'
    }

    return res.json({
      success: true,
      file: {
        mediaUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        mediaType,
      },
    })
  } catch (error) {
    next(error)
  }
}
