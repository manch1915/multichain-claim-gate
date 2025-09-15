import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Container } from '../../container.js'
import { optionalSession, parse } from '../session.js'

const params = z.object({ id: z.string().min(1).max(64) })

export const gateRoutes =
  ({ auth, gates }: Container): FastifyPluginAsync =>
  async (app) => {
    app.get('/gates', async () => ({ gates: await gates.list() }))

    app.get('/gates/:id', async (request) => {
      const { id } = parse(params, request.params)
      const gate = await gates.get(id)
      const session = await optionalSession(auth, request)
      const check = await gates.check(id, session)
      return {
        gate: { id: gate.id, title: gate.title, summary: gate.summary, rule: gate.rule },
        ...check,
      }
    })

    app.post(
      '/gates/:id/telegram',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (request) => {
        const { id } = parse(params, request.params)
        const session = await optionalSession(auth, request)
        return { invite: await gates.telegramInvite(id, session) }
      },
    )
  }
