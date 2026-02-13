import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database.js'
import { AppError } from '../middleware/errorHandler.js'

export async function searchUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { q } = req.query
    const currentUserId = req.user!.userId

    if (!q || typeof q !== 'string') {
      return res.json({ users: [] })
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUserId } },
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isOnline: true,
        lastSeen: true,
      },
      take: 10,
    })

    res.json({ users })
  } catch (error) {
    next(error)
  }
}

export async function getUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = req.params.id as string

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isOnline: true,
        lastSeen: true,
      },
    })

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND')
    }

    res.json({ user })
  } catch (error) {
    next(error)
  }
}
