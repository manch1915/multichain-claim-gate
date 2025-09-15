import type { FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod'
import { AppError } from '../domain/errors.js'
import type { Session } from '../domain/models.js'
import type { AuthService } from '../services/auth-service.js'

export const SESSION_COOKIE = 'mcg_session'

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure })
}

export function sessionToken(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE]
}

export async function optionalSession(auth: AuthService, request: FastifyRequest) {
  return auth.getSession(sessionToken(request))
}

export async function requireSession(auth: AuthService, request: FastifyRequest): Promise<Session> {
  const session = await optionalSession(auth, request)
  if (!session || session.accounts.length === 0) {
    throw new AppError('unauthorized', 'Sign in with a wallet first')
  }
  return session
}

export async function requireAdmin(auth: AuthService, request: FastifyRequest): Promise<Session> {
  const session = await requireSession(auth, request)
  if (!auth.isAdmin(session)) {
    throw new AppError(
      'forbidden',
      'Only project admins can change this. The demo shows it read-only.',
    )
  }
  return session
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new AppError(
      'bad_request',
      first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid request',
      result.error.issues,
    )
  }
  return result.data
}

export function sessionView(session: Session | undefined, isAdmin: boolean) {
  if (!session) return null
  return {
    accounts: session.accounts.map(({ family, chain, address }) => ({ family, chain, address })),
    isAdmin,
    expiresAt: session.expiresAt,
  }
}
