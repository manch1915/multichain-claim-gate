import type { FastifyPluginAsync } from 'fastify'
import type { Container } from '../../container.js'
import { requireSession } from '../session.js'

export const portfolioRoutes =
  ({ auth, portfolio }: Container): FastifyPluginAsync =>
  async (app) => {
    app.get('/portfolio', async (request) => {
      const session = await requireSession(auth, request)
      return portfolio.forSession(session)
    })
  }
