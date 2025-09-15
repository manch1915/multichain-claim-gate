import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Container } from '../../container.js'
import type { SponsoredAction } from '../../domain/models.js'
import { parse, requireSession } from '../session.js'

const evmBody = z.object({
  campaignId: z.string().min(1).max(64),
  chain: z.string().regex(/^eip155:\d+$/),
})
const solanaPrepareBody = z.object({ campaignId: z.string().min(1).max(64) })
const solanaSubmitBody = z.object({
  id: z.uuid(),
  transaction: z.string().min(100).max(4000),
})

export const claimRoutes =
  ({ auth, claims, paymaster, publicOrigin }: Container): FastifyPluginAsync =>
  async (app) => {
    const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

    app.post('/claims/evm', strict, async (request) => {
      const { campaignId, chain } = parse(evmBody, request.body)
      const session = await requireSession(auth, request)
      return { action: view(await claims.claimEvm(session, campaignId, chain)) }
    })

    app.get('/claims/evm/call', async (request) => {
      const { campaignId, chain } = parse(evmBody, request.query)
      const session = await requireSession(auth, request)
      const call = await claims.evmClaimCall(session, campaignId, chain)
      const chainId = Number(chain.split(':')[1])
      const account = session.accounts.find((item) => item.family === 'evm')
      const paymasterUrl =
        paymaster.enabled && account
          ? `${publicOrigin}/api/paymaster/${chainId}?token=${paymaster.issueToken(account.address, chainId)}`
          : null
      return { call, paymasterUrl }
    })

    app.post('/claims/pass', strict, async (request) => {
      const session = await requireSession(auth, request)
      return { action: view(await claims.mintPass(session)) }
    })

    app.post('/claims/solana/prepare', strict, async (request) => {
      const { campaignId } = parse(solanaPrepareBody, request.body)
      const session = await requireSession(auth, request)
      return claims.prepareSolanaClaim(session, campaignId)
    })

    app.post('/claims/solana/submit', strict, async (request) => {
      const { id, transaction } = parse(solanaSubmitBody, request.body)
      const session = await requireSession(auth, request)
      return { action: view(await claims.submitSolanaClaim(session, id, transaction)) }
    })

    app.get('/claims/:id', async (request) => {
      const { id } = parse(z.object({ id: z.uuid() }), request.params)
      const session = await requireSession(auth, request)
      return { action: view(await claims.getAction(session, id)) }
    })
  }

function view(action: SponsoredAction) {
  return {
    id: action.id,
    kind: action.kind,
    chain: action.chain,
    address: action.address,
    amount: action.amount,
    method: action.method,
    status: action.status,
    txHash: action.txHash,
    userOpHash: action.userOpHash,
    error: action.error,
    createdAt: action.createdAt,
  }
}
