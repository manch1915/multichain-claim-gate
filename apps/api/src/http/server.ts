import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import type { Container } from '../container.js'
import { AppError } from '../domain/errors.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { campaignRoutes } from './routes/campaigns.js'
import { claimRoutes } from './routes/claims.js'
import { gateRoutes } from './routes/gates.js'
import { paymasterRoutes } from './routes/paymaster.js'
import { portfolioRoutes } from './routes/portfolio.js'
import { SESSION_COOKIE } from './session.js'

export async function buildServer(
  container: Container,
  options: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1_048_576,
    ...options,
  })

  app.setReplySerializer((payload) =>
    JSON.stringify(payload, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  )

  await app.register(cookie)
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.cookies[SESSION_COOKIE] ?? request.ip,
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send({
        error: { code: error.code, message: error.message, details: error.details },
      })
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status === 429) {
      return reply.status(429).send({
        error: { code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' },
      })
    }
    if (status < 500) {
      return reply
        .status(status)
        .send({ error: { code: 'bad_request', message: (error as Error).message } })
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply
      .status(500)
      .send({ error: { code: 'internal', message: 'Something went wrong on our side' } })
  })

  app.get('/health', async () => ({ ok: true }))

  await app.register(authRoutes(container))
  await app.register(campaignRoutes(container))
  await app.register(claimRoutes(container))
  await app.register(gateRoutes(container))
  await app.register(portfolioRoutes(container))
  await app.register(paymasterRoutes(container))
  await app.register(adminRoutes(container))

  return app
}
