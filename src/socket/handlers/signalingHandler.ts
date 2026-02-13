import { Server } from 'socket.io'
import { prisma } from '../../config/database.js'
import { AuthenticatedSocket } from '../index.js'

type CallType = 'VOICE' | 'VIDEO'

// WebRTC types (not available in Node.js)
interface RTCSessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback'
  sdp?: string
}

interface RTCIceCandidate {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

interface InitiateCallPayload {
  receiverId: string
  type: CallType
}

interface RTCOfferPayload {
  callId: string
  offer: RTCSessionDescription
}

interface RTCAnswerPayload {
  callId: string
  answer: RTCSessionDescription
}

interface RTCIceCandidatePayload {
  callId: string
  candidate: RTCIceCandidate
}

// Store active calls in memory
const activeCalls = new Map<string, {
  initiatorId: string
  receiverId: string
  type: CallType
}>()

export function handleSignaling(io: Server, socket: AuthenticatedSocket) {
  // Initiate a call
  socket.on('call:initiate', async (data: InitiateCallPayload) => {
    try {
      const { receiverId, type } = data

      // Check if receiver exists and is online
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true, username: true, isOnline: true },
      })

      if (!receiver) {
        socket.emit('error', { code: 'USER_NOT_FOUND', message: 'User not found' })
        return
      }

      if (!receiver.isOnline) {
        socket.emit('error', { code: 'USER_OFFLINE', message: 'User is offline' })
        return
      }

      // Get initiator info
      const initiator = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      })

      // Create call record
      const call = await prisma.call.create({
        data: {
          type,
          status: 'RINGING',
          initiatorId: socket.userId,
          receiverId,
        },
      })

      // Store in memory
      activeCalls.set(call.id, {
        initiatorId: socket.userId,
        receiverId,
        type,
      })

      // Notify receiver
      io.to(`user:${receiverId}`).emit('call:incoming', {
        callId: call.id,
        initiator,
        type,
      })

      // Send call ID back to initiator
      socket.emit('call:initiated', { callId: call.id })

      console.log(`Call initiated: ${call.id} from ${socket.userId} to ${receiverId}`)
    } catch (error) {
      console.error('Error initiating call:', error)
      socket.emit('error', { code: 'CALL_FAILED', message: 'Failed to initiate call' })
    }
  })

  // Accept a call
  socket.on('call:accept', async (callId: string) => {
    try {
      const callData = activeCalls.get(callId)
      if (!callData) {
        socket.emit('error', { code: 'CALL_NOT_FOUND', message: 'Call not found' })
        return
      }

      // Update call status
      await prisma.call.update({
        where: { id: callId },
        data: { status: 'ONGOING', startedAt: new Date() },
      })

      // Notify initiator
      io.to(`user:${callData.initiatorId}`).emit('call:accepted', callId)

      console.log(`Call accepted: ${callId}`)
    } catch (error) {
      console.error('Error accepting call:', error)
    }
  })

  // Reject a call
  socket.on('call:reject', async (callId: string) => {
    try {
      const callData = activeCalls.get(callId)
      if (!callData) return

      // Update call status
      await prisma.call.update({
        where: { id: callId },
        data: { status: 'REJECTED', endedAt: new Date() },
      })

      // Remove from memory
      activeCalls.delete(callId)

      // Notify initiator
      io.to(`user:${callData.initiatorId}`).emit('call:rejected', callId)

      console.log(`Call rejected: ${callId}`)
    } catch (error) {
      console.error('Error rejecting call:', error)
    }
  })

  // End a call
  socket.on('call:end', async (callId: string) => {
    try {
      const callData = activeCalls.get(callId)
      if (!callData) return

      // Calculate duration
      const call = await prisma.call.findUnique({ where: { id: callId } })
      const duration = call?.startedAt
        ? Math.floor((Date.now() - call.startedAt.getTime()) / 1000)
        : 0

      // Update call status
      await prisma.call.update({
        where: { id: callId },
        data: { status: 'ENDED', endedAt: new Date(), duration },
      })

      // Remove from memory
      activeCalls.delete(callId)

      // Notify both parties
      const otherUserId = socket.userId === callData.initiatorId
        ? callData.receiverId
        : callData.initiatorId

      io.to(`user:${otherUserId}`).emit('call:ended', callId)

      console.log(`Call ended: ${callId}, duration: ${duration}s`)
    } catch (error) {
      console.error('Error ending call:', error)
    }
  })

  // WebRTC Signaling: Offer
  socket.on('rtc:offer', (data: RTCOfferPayload) => {
    const callData = activeCalls.get(data.callId)
    if (!callData) return

    const targetId = socket.userId === callData.initiatorId
      ? callData.receiverId
      : callData.initiatorId

    io.to(`user:${targetId}`).emit('rtc:offer', data)
  })

  // WebRTC Signaling: Answer
  socket.on('rtc:answer', (data: RTCAnswerPayload) => {
    const callData = activeCalls.get(data.callId)
    if (!callData) return

    const targetId = socket.userId === callData.initiatorId
      ? callData.receiverId
      : callData.initiatorId

    io.to(`user:${targetId}`).emit('rtc:answer', data)
  })

  // WebRTC Signaling: ICE Candidate
  socket.on('rtc:ice-candidate', (data: RTCIceCandidatePayload) => {
    const callData = activeCalls.get(data.callId)
    if (!callData) return

    const targetId = socket.userId === callData.initiatorId
      ? callData.receiverId
      : callData.initiatorId

    io.to(`user:${targetId}`).emit('rtc:ice-candidate', data)
  })

  // Handle disconnect during call
  socket.on('disconnect', async () => {
    // Find any active calls involving this user
    for (const [callId, callData] of activeCalls.entries()) {
      if (callData.initiatorId === socket.userId || callData.receiverId === socket.userId) {
        // End the call
        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ENDED', endedAt: new Date() },
        })

        activeCalls.delete(callId)

        // Notify the other party
        const otherUserId = socket.userId === callData.initiatorId
          ? callData.receiverId
          : callData.initiatorId

        io.to(`user:${otherUserId}`).emit('call:ended', callId)
      }
    }
  })
}
