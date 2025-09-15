import { createHash, randomBytes } from 'node:crypto'
import { chainByCaip2, familyOfChain, parseAccountId } from '@mcg/core'
import { AppError } from '../domain/errors.js'
import type { Session } from '../domain/models.js'
import type { SignatureVerifier } from '../ports/auth.js'
import type { AuthRepository } from '../ports/repositories.js'
import { buildSignInMessage, extractNonce } from '../infra/siwx/messages.js'

export interface AuthOptions {
  origin: string
  sessionTtlMs: number
  nonceTtlMs: number
  adminAddresses: string[]
  allowLocalChains: boolean
}

const STATEMENT =
  'Sign in to Meridian Claim & Gate. This request costs nothing and does not move funds.'

export class AuthService {
  private readonly admins: Set<string>

  constructor(
    private readonly repo: AuthRepository,
    private readonly verifier: SignatureVerifier,
    private readonly options: AuthOptions,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.admins = new Set(options.adminAddresses.map(normalizeForCompare))
  }

  async issueMessage(accountId: string): Promise<{ message: string; expiresAt: Date }> {
    let account
    try {
      account = parseAccountId(accountId)
    } catch (error) {
      throw new AppError('bad_request', (error as Error).message)
    }
    const chain = chainByCaip2(account.chain)
    if (!chain || (chain.key === 'anvil' && !this.options.allowLocalChains)) {
      throw new AppError('bad_request', `Sign-in on ${account.chain} is not supported`)
    }

    const issuedAt = this.now()
    const expiresAt = new Date(issuedAt.getTime() + this.options.nonceTtlMs)
    const nonce = randomBytes(16).toString('hex')
    const origin = new URL(this.options.origin)
    const message = buildSignInMessage({
      chain: account.chain,
      address: account.address,
      domain: origin.host,
      uri: origin.origin,
      nonce,
      issuedAt,
      expirationTime: expiresAt,
      statement: STATEMENT,
    })

    await this.repo.saveNonce({
      nonce,
      accountId: `${account.chain}:${account.address}`,
      message,
      expiresAt,
    })
    return { message, expiresAt }
  }

  /**
   * Verifies a signed sign-in message and links the account to the caller's session, creating
   * one when needed. Returns the raw session token for the cookie.
   */
  async verify(
    message: string,
    signature: string,
    currentToken: string | undefined,
  ): Promise<{ token: string; session: Session }> {
    const nonce = extractNonce(message)
    const record = nonce ? await this.repo.consumeNonce(nonce, this.now()) : undefined
    if (!record || record.message !== message) {
      throw new AppError(
        'nonce_invalid',
        'This sign-in request expired or was already used. Try again.',
      )
    }

    const account = parseAccountId(record.accountId)
    const valid = await this.verifier.verify(account.chain, account.address, message, signature)
    if (!valid) throw new AppError('signature_invalid', 'The signature does not match this wallet')

    let token = currentToken
    let session = token ? await this.repo.findSession(hashToken(token), this.now()) : undefined
    if (!session || !token) {
      token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(this.now().getTime() + this.options.sessionTtlMs)
      await this.repo.createSession(hashToken(token), expiresAt)
    }

    await this.repo.upsertAccount(hashToken(token), {
      family: familyOfChain(account.chain),
      chain: account.chain,
      address: account.address,
      verifiedAt: this.now(),
    })
    session = await this.repo.findSession(hashToken(token), this.now())
    if (!session) throw new Error('Session disappeared right after creation')
    return { token, session }
  }

  async getSession(token: string | undefined): Promise<Session | undefined> {
    if (!token) return undefined
    return this.repo.findSession(hashToken(token), this.now())
  }

  /** Signs out one account family, or the whole session when no family is given. */
  async signOut(token: string, family?: 'evm' | 'solana'): Promise<Session | undefined> {
    const id = hashToken(token)
    if (family) {
      await this.repo.removeAccount(id, family)
      const session = await this.repo.findSession(id, this.now())
      if (session && session.accounts.length > 0) return session
    }
    await this.repo.deleteSession(id)
    return undefined
  }

  isAdmin(session: Session | undefined): boolean {
    return Boolean(
      session?.accounts.some((account) => this.admins.has(normalizeForCompare(account.address))),
    )
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeForCompare(address: string): string {
  return address.startsWith('0x') ? address.toLowerCase() : address
}
