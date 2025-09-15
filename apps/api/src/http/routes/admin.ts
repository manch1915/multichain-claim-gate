import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Container } from '../../container.js'
import { optionalSession, parse, requireAdmin } from '../session.js'

const campaignParams = z.object({ id: z.string().min(1).max(64) })
const gateParams = z.object({ id: z.string().regex(/^[a-z0-9-]{3,40}$/) })
const csvBody = z.object({ csv: z.string().min(1).max(512_000) })

export const adminRoutes =
  ({ auth, admin, campaigns, gates, demoCampaignId }: Container): FastifyPluginAsync =>
  async (app) => {
    // Read-only for everyone: the demo shows what a project owner would see.
    app.get('/admin/dashboard', async (request) => {
      const session = await optionalSession(auth, request)
      return {
        canEdit: auth.isAdmin(session),
        campaign: await campaigns.overview(demoCampaignId),
        ...(await admin.dashboard(demoCampaignId)),
        gates: await gates.list(),
      }
    })

    app.post('/admin/campaigns/:id/whitelist', async (request) => {
      await requireAdmin(auth, request)
      const { id } = parse(campaignParams, request.params)
      const { csv } = parse(csvBody, request.body)
      return campaigns.importWhitelist(id, csv)
    })

    app.put('/admin/gates/:id', async (request) => {
      await requireAdmin(auth, request)
      const { id } = parse(gateParams, request.params)
      return { gate: await gates.upsert(id, request.body) }
    })
  }
