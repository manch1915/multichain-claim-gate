import { randomUUID } from 'node:crypto'
import { chains, familyOfChain } from '@mcg/core'
import { AppError } from '../domain/errors.js'
import type { Session, SponsoredAction } from '../domain/models.js'
import { safeErrorMessage } from '../domain/safe-error.js'
import type { EvmGateway, EvmSponsor, SolanaGateway } from '../ports/chains.js'
import type { ActionRepository, PreparedTransactionRepository } from '../ports/repositories.js'
import type { CampaignService } from './campaign-service.js'
import type { Logger } from './logger.js'

const PREPARED_TTL_MS = 60_000

export class ClaimService {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly actions: ActionRepository,
    private readonly prepared: PreparedTransactionRepository,
    private readonly evm: EvmGateway | undefined,
    private readonly sponsor: EvmSponsor | undefined,
    private readonly solana: SolanaGateway | undefined,
    private readonly logger: Logger,
  ) {}

  /** Claims on an EVM chain through the sponsor account. The user signs nothing and pays nothing. */
  async claimEvm(session: Session, campaignId: string, chain: string): Promise<SponsoredAction> {
    const { evm } = this.requireEvm()
    const account = accountFor(session, chain)

    const active = await this.actions.findActive('airdrop', chain, account)
    if (active) return active

    const proof = await this.campaigns.proofFor(campaignId, chain, account)
    const hexProof = proof.proof as `0x${string}`[]
    await evm.simulateClaim(chain, account, proof.amount, hexProof)

    return this.sponsorAction({
      kind: 'airdrop',
      campaignId,
      chain,
      address: account,
      amount: proof.amount,
      calls: [evm.claimCall(chain, account, proof.amount, hexProof)],
    })
  }

  /** Calldata for wallets that pay through their own paymaster capability (EIP-5792). */
  async evmClaimCall(session: Session, campaignId: string, chain: string) {
    const { evm } = this.requireEvm()
    const account = accountFor(session, chain)
    const proof = await this.campaigns.proofFor(campaignId, chain, account)
    const call = evm.claimCall(chain, account, proof.amount, proof.proof as `0x${string}`[])
    return { ...call, amount: proof.amount.toString() }
  }

  async mintPass(session: Session): Promise<SponsoredAction> {
    const { evm } = this.requireEvm()
    const chain = evm.passChain()
    if (!chain) throw new AppError('not_configured', 'The access pass is not deployed')
    const account = accountFor(session, chain)

    const active = await this.actions.findActive('pass', chain, account)
    if (active) return active
    if (await evm.hasPass(chain, account)) {
      throw new AppError('already_claimed', 'This wallet already holds a Meridian Pass')
    }

    return this.sponsorAction({
      kind: 'pass',
      campaignId: null,
      chain,
      address: account,
      amount: null,
      calls: [evm.mintPassCall(chain, account)],
    })
  }

  /** Step one of a Solana claim: the backend builds the transaction and pays its fee and rent. */
  async prepareSolanaClaim(session: Session, campaignId: string) {
    const solana = this.requireSolana()
    const chain = chains.solanaDevnet.caip2
    const claimant = accountFor(session, chain)
    const proof = await this.campaigns.proofFor(campaignId, chain, claimant)
    const prepared = await solana.prepareClaim(
      claimant,
      proof.amount,
      proof.proof.map((node) => Uint8Array.from(Buffer.from(node, 'hex'))),
    )

    const id = randomUUID()
    await this.prepared.save({
      id,
      sessionId: session.id,
      address: claimant,
      campaignId,
      amount: proof.amount,
      messageBase64: prepared.messageBase64,
      expiresAt: new Date(Date.now() + PREPARED_TTL_MS),
    })
    return { id, transaction: prepared.transactionBase64, amount: proof.amount.toString() }
  }

  /** Step two: the wallet signed as claimant, the backend adds the fee payer signature and sends. */
  async submitSolanaClaim(session: Session, preparedId: string, signedTransaction: string) {
    const solana = this.requireSolana()
    const record = await this.prepared.take(preparedId, session.id, new Date())
    if (!record) {
      throw new AppError('nonce_invalid', 'This claim request expired. Start the claim again.')
    }

    const signature = await solana.submitClaim(signedTransaction, record.messageBase64)
    const action: SponsoredAction = {
      id: randomUUID(),
      kind: 'airdrop',
      campaignId: record.campaignId,
      chain: chains.solanaDevnet.caip2,
      address: record.address,
      amount: record.amount,
      method: 'solana-fee-payer',
      status: 'pending',
      txHash: signature,
      userOpHash: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await this.actions.create(action)
    void solana
      .confirm(signature)
      .then((ok) =>
        this.actions.update(
          action.id,
          ok ? { status: 'confirmed' } : { status: 'failed', error: 'Transaction failed' },
        ),
      )
      .catch((error: unknown) => this.fail(action.id, error))
    return action
  }

  async getAction(session: Session, id: string): Promise<SponsoredAction> {
    const action = await this.actions.find(id)
    const owns =
      action && session.accounts.some((account) => sameAddress(account.address, action.address))
    if (!action || !owns) throw new AppError('not_found', 'Claim not found')
    return action
  }

  private async sponsorAction(input: {
    kind: SponsoredAction['kind']
    campaignId: string | null
    chain: string
    address: string
    amount: bigint | null
    calls: Parameters<EvmSponsor['submit']>[1]
  }): Promise<SponsoredAction> {
    const { sponsor } = this.requireEvm()
    const action: SponsoredAction = {
      id: randomUUID(),
      kind: input.kind,
      campaignId: input.campaignId,
      chain: input.chain,
      address: input.address,
      amount: input.amount,
      method: sponsor.method,
      status: 'pending',
      txHash: null,
      userOpHash: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await this.actions.create(action)

    let submission
    try {
      submission = await sponsor.submit(input.chain, input.calls)
    } catch (error) {
      await this.fail(action.id, error)
      throw new AppError(
        'chain_error',
        'The sponsor could not submit the transaction. Try again shortly.',
      )
    }

    const hashField = submission.method === 'sponsored-userop' ? 'userOpHash' : 'txHash'
    await this.actions.update(action.id, { [hashField]: submission.hash })
    void submission
      .wait()
      .then((receipt) =>
        this.actions.update(action.id, {
          status: receipt.success ? 'confirmed' : 'failed',
          txHash: receipt.txHash,
          error: receipt.success ? null : 'Transaction reverted',
        }),
      )
      .catch((error: unknown) => this.fail(action.id, error))

    return { ...action, [hashField]: submission.hash }
  }

  private async fail(id: string, error: unknown) {
    this.logger.error({ err: error, actionId: id }, 'sponsored action failed')
    await this.actions
      .update(id, { status: 'failed', error: safeErrorMessage(error) })
      .catch(() => undefined)
  }

  private requireEvm() {
    if (!this.evm || !this.sponsor) {
      throw new AppError('not_configured', 'Gasless EVM claims are not configured on this server')
    }
    return { evm: this.evm, sponsor: this.sponsor }
  }

  private requireSolana() {
    if (!this.solana)
      throw new AppError('not_configured', 'Solana claims are not configured on this server')
    return this.solana
  }
}

function accountFor(session: Session, chain: string): string {
  const family = familyOfChain(chain)
  const account = session.accounts.find((item) => item.family === family)
  if (!account) {
    throw new AppError(
      'unauthorized',
      `Sign in with ${family === 'evm' ? 'an EVM' : 'a Solana'} wallet first`,
    )
  }
  return account.address
}

function sameAddress(a: string, b: string): boolean {
  return a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b
}
