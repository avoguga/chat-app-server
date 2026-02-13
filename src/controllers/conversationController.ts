import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database.js'
import { AppError } from '../middleware/errorHandler.js'

export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user!.userId

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Format response with lastMessage
    const formatted = conversations.map((conv) => ({
      ...conv,
      lastMessage: conv.messages[0] || null,
      messages: undefined,
    }))

    res.json({ conversations: formatted })
  } catch (error) {
    next(error)
  }
}

export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = req.params.id as string
    const userId = req.user!.userId

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    })

    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    res.json({ conversation })
  } catch (error) {
    next(error)
  }
}

export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { participantIds, type = 'DIRECT', name } = req.body
    const userId = req.user!.userId

    if (!participantIds || !Array.isArray(participantIds)) {
      throw new AppError('Participant IDs required', 400, 'INVALID_REQUEST')
    }

    const allParticipants = [...new Set([userId, ...participantIds])]

    const conversation = await prisma.conversation.create({
      data: {
        type,
        name: type === 'GROUP' ? name : null,
        participants: {
          create: allParticipants.map((id) => ({
            userId: id,
            isAdmin: id === userId,
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
      },
    })

    res.status(201).json({ conversation })
  } catch (error) {
    next(error)
  }
}

export async function getOrCreateDirectConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const otherUserId = req.params.userId as string
    const userId = req.user!.userId

    // Check if conversation already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: otherUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    })

    if (existing) {
      return res.json({ conversation: existing })
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        participants: {
          create: [
            { userId },
            { userId: otherUserId },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
        messages: true,
      },
    })

    res.status(201).json({ conversation })
  } catch (error) {
    next(error)
  }
}
