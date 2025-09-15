import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Container } from '../../container.js'
import { parse, requireSession } from '../session.js'

const params = z.object({ id: z.string().min(1).max(64) })
const csvBody = z.object({ csv: z.string().min(1).max(512_000) })

export const campaignRoutes =
  ({ auth, campaigns }: Container): FastifyPluginAsync =>
  async (app) => {
    app.get('/campaigns/:id', async (request) => {
      const { id } = parse(params, request.params)
      return campaigns.overview(id)
    })

    app.get('/campaigns/:id/eligibility', async (request) => {
      const { id } = parse(params, request.params)
      const session = await requireSession(auth, request)
      return { chains: await campaigns.eligibility(id, session) }
    })

    app.post(
      '/campaigns/:id/demo-join',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (request) => {
        const { id } = parse(params, request.params)
        const session = await requireSession(auth, request)
        return campaigns.joinDemo(id, session)
      },
    )

    app.post(
      '/campaigns/:id/whitelist/preview',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (request) => {
        const { id } = parse(params, request.params)
        const { csv } = parse(csvBody, request.body)
        return campaigns.previewWhitelist(id, csv)
      },
    )
  }
