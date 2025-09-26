import { createHmac, timingSafeEqual } from 'node:crypto'
import { isHex, type Hex } from 'viem'
import { AppError } from '../domain/errors.js'
import { decodeSponsorableClaim, usesKnownAccountCode } from './paymaster-policy.js'

const TOKEN_TTL_MS = 10 * 60_000
const STUB = 'pm_getPaymasterStubData'
const FINAL = 'pm_getPaymasterData'
const REQUESTS_PER_ADDRESS = 10
const RATE_WINDOW_MS = 10 * 60_000
/** How long a signed sponsorship blocks another one for the same wallet and chain. */
const SPONSORSHIP_LOCK_MS = 5 * 60_000

// A claim costs well under these; anything bigger is an account burning sponsored gas.
const GAS_LIMIT_CAPS: Record<string, bigint> = {
  callGasLimit: 400_000n,
  verificationGasLimit: 600_000n,
  preVerificationGas: 300_000n,
}
const PAYMASTER_GAS_CAPS: Record<string, bigint> = {
  paymasterVerificationGasLimit: 300_000n,
  paymasterPostOpGasLimit: 100_000n,
}
// Testnet fees sit far below this; it stops an operation from bidding the sponsor's budget away.
const FEE_CAPS: Record<string, bigint> = {
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 5_000_000_000n,
}

export interface ExpectedClaim {
  amount: bigint
  proof: Hex[]
}

/** The claim the server would build for this wallet right now, or undefined if it has none. */
export type ExpectedClaimLookup = (
  chainId: number,
  address: string,
) => Promise<ExpectedClaim | undefined>

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
 * HMAC token bound to one address and chain. Only the exact claim the server would build for that
 * wallet is sponsored, with capped gas and at most one signed sponsorship at a time.
 */
export class PaymasterService {
  private readonly requests = new Map<string, number[]>()
  private readonly sponsored = new Map<string, number>()

  constructor(
    private readonly secret: string,
    private readonly distributors: Map<number, string>,
    private readonly upstream: PaymasterUpstream | undefined,
    private readonly expectedClaim: ExpectedClaimLookup,
  ) {}

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
    if (request.method !== STUB && request.method !== FINAL) {
      return rpcError(request.id, -32601, 'Method not supported')
    }

    const [userOp = {}] = (request.params ?? []) as [Record<string, unknown> | undefined]
    const sender = userOp['sender']
    if (typeof sender !== 'string' || sender.toLowerCase() !== payload.address) {
      return rpcError(request.id, -32602, 'Sender does not match the signed-in wallet')
    }
    const distributor = this.distributors.get(chainId)
    const callData = userOp['callData']
    const claim =
      distributor && isHex(callData)
        ? decodeSponsorableClaim(callData, sender, distributor)
        : undefined
    if (!claim) return rpcError(request.id, -32602, 'Only airdrop claims are sponsored')
    if (!usesKnownAccountCode(userOp)) {
      return rpcError(request.id, -32602, 'This smart account implementation is not supported')
    }
    if (!withinCaps(userOp, request.method === FINAL)) {
      return rpcError(request.id, -32602, 'Gas settings are out of range for a claim')
    }
    if (!this.allowRequest(payload.address, now)) {
      return rpcError(request.id, -32005, 'Too many sponsorship requests for this wallet')
    }

    const expected = await this.expectedClaim(chainId, sender)
    if (!expected || !sameClaim(expected, claim)) {
      return rpcError(request.id, -32602, 'Nothing to claim for this wallet on this network')
    }

    if (request.method === FINAL) {
      const lockKey = `${chainId}:${payload.address}`
      if ((this.sponsored.get(lockKey) ?? 0) > now) {
        return rpcError(request.id, -32005, 'A sponsored claim for this wallet is already pending')
      }
      this.sponsored.set(lockKey, now + SPONSORSHIP_LOCK_MS)
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

function sameClaim(expected: ExpectedClaim, actual: ExpectedClaim): boolean {
  return (
    expected.amount === actual.amount &&
    expected.proof.length === actual.proof.length &&
    expected.proof.every((node, i) => node.toLowerCase() === actual.proof[i]?.toLowerCase())
  )
}

/** Stub requests may omit gas fields; the final request must carry the limits and fees. */
function withinCaps(userOp: Record<string, unknown>, final: boolean): boolean {
  const required = new Set(final ? [...Object.keys(GAS_LIMIT_CAPS), ...Object.keys(FEE_CAPS)] : [])
  const caps = { ...GAS_LIMIT_CAPS, ...PAYMASTER_GAS_CAPS, ...FEE_CAPS }
  return Object.entries(caps).every(([field, cap]) => {
    const value = userOp[field]
    if (value === undefined || value === null) return !required.has(field)
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
