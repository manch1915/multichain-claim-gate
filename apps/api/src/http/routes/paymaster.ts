import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Container } from '../../container.js'
import { parse } from '../session.js'

const params = z.object({ chainId: z.coerce.number().int().positive() })
const query = z.object({ token: z.string().min(20).max(400) })

export const paymasterRoutes =
  ({ paymaster }: Container): FastifyPluginAsync =>
  async (app) => {
    app.post(
      '/paymaster/:chainId',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      async (request) => {
        const { chainId } = parse(params, request.params)
        const { token } = parse(query, request.query)
        return paymaster.handle(chainId, token, (request.body ?? {}) as object)
      },
    )
  }
