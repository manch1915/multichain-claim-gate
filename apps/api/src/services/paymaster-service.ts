import { createHmac, timingSafeEqual } from 'node:crypto'
import { isHex } from 'viem'
import { AppError } from '../domain/errors.js'
import { isSponsorableClaim, usesKnownAccountCode } from './paymaster-policy.js'

const TOKEN_TTL_MS = 10 * 60_000
const ALLOWED_METHODS = new Set(['pm_getPaymasterStubData', 'pm_getPaymasterData'])
const REQUESTS_PER_ADDRESS = 10
const RATE_WINDOW_MS = 10 * 60_000

// A claim costs well under these; anything bigger is an account burning sponsored gas.
const GAS_CAPS: Record<string, bigint> = {
  callGasLimit: 400_000n,
  verificationGasLimit: 600_000n,
  preVerificationGas: 300_000n,
  paymasterVerificationGasLimit: 300_000n,
  paymasterPostOpGasLimit: 100_000n,
}

/** Whether the address still has something to claim on this chain right now. */
export type ClaimEligibility = (chainId: number, address: string) => Promise<boolean>

export interface PaymasterUpstream {
  forward(chainId: number, body: unknown): Promise<unknown>
}

interface TokenPayload {
  address: string
  chainId: number
  expires: number
}

interface JsonRpcRequest {
  id?: unknown
  jsonrpc?: string
  method?: string
  params?: unknown[]
}

/**
 * ERC-7677 proxy for wallets that sponsor calls through `paymasterService`. The wallet calls this
 * URL itself (not the page), so cookies are not available: access is granted by a short-lived
 * HMAC token bound to one address and chain, and only claim calls to our distributor pass.
 */
export class PaymasterService {
  constructor(
    private readonly secret: string,
    private readonly distributors: Map<number, string>,
    private readonly upstream: PaymasterUpstream | undefined,
    private readonly isEligible: ClaimEligibility,
  ) {}

  private readonly requests = new Map<string, number[]>()

  get enabled(): boolean {
    return Boolean(this.upstream)
  }

  issueToken(address: string, chainId: number, now = Date.now()): string {
    const payload: TokenPayload = {
      address: address.toLowerCase(),
      chainId,
      expires: now + TOKEN_TTL_MS,
    }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${body}.${this.sign(body)}`
  }

  async handle(
    chainId: number,
    token: string,
    request: JsonRpcRequest,
    now = Date.now(),
  ): Promise<unknown> {
    if (!this.upstream) throw new AppError('not_configured', 'Wallet paymaster is not configured')
    const payload = this.verifyToken(token, now)
    if (payload.chainId !== chainId) throw new AppError('forbidden', 'Token is for another chain')
    if (!request.method || !ALLOWED_METHODS.has(request.method)) {
      return rpcError(request.id, -32601, 'Method not supported')
    }

    const [userOp] = (request.params ?? []) as [Record<string, unknown> | undefined]
    const distributor = this.distributors.get(chainId)
    if (typeof userOp?.sender !== 'string' || userOp.sender.toLowerCase() !== payload.address) {
      return rpcError(request.id, -32602, 'Sender does not match the signed-in wallet')
    }
    if (
      !distributor ||
      !isHex(userOp.callData) ||
      !isSponsorableClaim(userOp.callData, userOp.sender, distributor)
    ) {
      return rpcError(request.id, -32602, 'Only airdrop claims are sponsored')
    }
    if (!usesKnownAccountCode(userOp)) {
      return rpcError(request.id, -32602, 'This smart account implementation is not supported')
    }
    if (!withinGasCaps(userOp)) {
      return rpcError(request.id, -32602, 'Gas limits are too high for a claim')
    }
    if (!this.allowRequest(payload.address, now)) {
      return rpcError(request.id, -32005, 'Too many sponsorship requests for this wallet')
    }
    if (!(await this.isEligible(chainId, userOp.sender))) {
      return rpcError(request.id, -32602, 'Nothing to claim for this wallet on this network')
    }
    return this.upstream.forward(chainId, request)
  }

  private allowRequest(address: string, now: number): boolean {
    const recent = (this.requests.get(address) ?? []).filter((time) => now - time < RATE_WINDOW_MS)
    if (recent.length >= REQUESTS_PER_ADDRESS) return false
    recent.push(now)
    this.requests.set(address, recent)
    return true
  }

  private verifyToken(token: string, now: number): TokenPayload {
    const [body, signature] = token.split('.')
    if (!body || !signature) throw new AppError('unauthorized', 'Missing paymaster token')
    const expected = Buffer.from(this.sign(body))
    const actual = Buffer.from(signature)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AppError('unauthorized', 'Invalid paymaster token')
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload
    if (payload.expires < now) throw new AppError('unauthorized', 'Paymaster token expired')
    return payload
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(`paymaster:${body}`).digest('base64url')
  }
}

function withinGasCaps(userOp: Record<string, unknown>): boolean {
  return Object.entries(GAS_CAPS).every(([field, cap]) => {
    const value = userOp[field]
    if (value === undefined || value === null) return true
    if (typeof value !== 'string' || !isHex(value)) return false
    return BigInt(value) <= cap
  })
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

export class PimlicoUpstream implements PaymasterUpstream {
  constructor(
    private readonly apiKey: string,
    private readonly sponsorshipPolicyId: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async forward(chainId: number, body: JsonRpcRequest): Promise<unknown> {
    const params = [...(body.params ?? [])]
    if (this.sponsorshipPolicyId) params[3] = { sponsorshipPolicyId: this.sponsorshipPolicyId }
    const response = await this.fetchImpl(
      `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, params }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    return response.json()
  }
}
