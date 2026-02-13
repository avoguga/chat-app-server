import { Server } from 'socket.io'
import { prisma } from '../../config/database.js'
import { AuthenticatedSocket } from '../index.js'

interface SendMessagePayload {
  conversationId: string
  content: string
}

interface ReadMessagePayload {
  conversationId: string
  messageId: string
}

export function handleMessages(io: Server, socket: AuthenticatedSocket) {
  // Send message
  socket.on('message:send', async (data: SendMessagePayload) => {
    try {
      const { conversationId, content } = data

      // Verify user is participant
      const participant = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId: socket.userId,
        },
      })

      if (!participant) {
        socket.emit('error', { code: 'NOT_PARTICIPANT', message: 'Not a participant of this conversation' })
        return
      }

      // Create message
      const message = await prisma.message.create({
        data: {
          content,
          senderId: socket.userId,
          conversationId,
          type: 'TEXT',
          status: 'SENT',
        },
      })

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      })

      // Emit to all participants in the room
      io.to(`conversation:${conversationId}`).emit('message:new', message)

      // Update status to DELIVERED for online recipients
      const otherParticipants = await prisma.participant.findMany({
        where: {
          conversationId,
          userId: { not: socket.userId },
        },
        include: {
          user: true,
        },
      })

      const onlineRecipients = otherParticipants.filter(p => p.user.isOnline)

      if (onlineRecipients.length > 0) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: 'DELIVERED' },
        })

        io.to(`conversation:${conversationId}`).emit('message:status', {
          messageId: message.id,
          status: 'DELIVERED',
        })
      }
    } catch (error) {
      console.error('Error sending message:', error)
      socket.emit('error', { code: 'MESSAGE_FAILED', message: 'Failed to send message' })
    }
  })

  // Mark message as delivered
  socket.on('message:delivered', async (messageId: string) => {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      })

      if (!message) return

      // Only update if not already read
      if (message.status === 'SENT') {
        await prisma.message.update({
          where: { id: messageId },
          data: { status: 'DELIVERED' },
        })

        io.to(`conversation:${message.conversationId}`).emit('message:status', {
          messageId,
          status: 'DELIVERED',
        })
      }
    } catch (error) {
      console.error('Error marking message as delivered:', error)
    }
  })

  // Mark message as read
  socket.on('message:read', async (data: ReadMessagePayload) => {
    try {
      const { conversationId, messageId } = data

      // Update participant's last read timestamp
      await prisma.participant.updateMany({
        where: {
          conversationId,
          userId: socket.userId,
        },
        data: { lastReadAt: new Date() },
      })

      // Update message status
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      })

      if (message && message.senderId !== socket.userId) {
        await prisma.message.update({
          where: { id: messageId },
          data: { status: 'READ' },
        })

        io.to(`conversation:${conversationId}`).emit('message:status', {
          messageId,
          status: 'READ',
        })
      }
    } catch (error) {
      console.error('Error marking message as read:', error)
    }
  })
}
