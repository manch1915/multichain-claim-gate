import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Container } from '../../container.js'
import {
  clearSessionCookie,
  parse,
  sessionToken,
  sessionView,
  setSessionCookie,
} from '../session.js'

const messageBody = z.object({ accountId: z.string().min(10).max(140) })
const verifyBody = z.object({
  message: z.string().min(50).max(2000),
  signature: z.string().min(40).max(4000),
})
const signOutBody = z.object({ family: z.enum(['evm', 'solana']).optional() }).default({})

export const authRoutes =
  ({ auth, secureCookies }: Container): FastifyPluginAsync =>
  async (app) => {
    const strict = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }

    app.post('/auth/message', strict, async (request) => {
      const { accountId } = parse(messageBody, request.body)
      return auth.issueMessage(accountId)
    })

    app.post('/auth/verify', strict, async (request, reply) => {
      const { message, signature } = parse(verifyBody, request.body)
      const { token, session } = await auth.verify(message, signature, sessionToken(request))
      setSessionCookie(reply, token, session.expiresAt, secureCookies)
      return { session: sessionView(session, auth.isAdmin(session)) }
    })

    app.get('/auth/session', async (request) => {
      const session = await auth.getSession(sessionToken(request))
      return { session: sessionView(session, auth.isAdmin(session)) }
    })

    app.post('/auth/sign-out', async (request, reply) => {
      const { family } = parse(signOutBody, request.body ?? {})
      const token = sessionToken(request)
      if (!token) return { session: null }
      const session = await auth.signOut(token, family)
      if (!session) clearSessionCookie(reply, secureCookies)
      return { session: sessionView(session, auth.isAdmin(session)) }
    })
  }
