import {
  buildEvmTree,
  buildSolanaTree,
  chainByCaip2,
  chains,
  parseWhitelist,
  type ChainFamily,
  type WhitelistParseResult,
} from '@mcg/core'
import { parseUnits } from 'viem'
import { AppError } from '../domain/errors.js'
import type { AllocationRecord, Campaign, Session, TreeSnapshot } from '../domain/models.js'
import type { EvmGateway, SolanaGateway } from '../ports/chains.js'
import type { CampaignRepository } from '../ports/repositories.js'
import type { RootPublisher } from './root-publisher.js'

export type EligibilityStatus =
  'not_listed' | 'pending_publication' | 'claimable' | 'claimed' | 'paused' | 'unavailable'

export interface ChainEligibility {
  chain: string
  family: ChainFamily
  address: string
  status: EligibilityStatus
  /** Amounts in base units as decimal strings. */
  allocated: string
  published: string
  claimed: string
  claimable: string
  decimals: number
  error?: string
}

export interface ProofResult {
  chain: string
  address: string
  amount: bigint
  proof: string[]
  root: string
}

export class CampaignService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly evm: EvmGateway | undefined,
    private readonly solana: SolanaGateway | undefined,
    private readonly publisher: RootPublisher,
  ) {}

  async getCampaign(id: string): Promise<Campaign> {
    const campaign = await this.campaigns.findCampaign(id)
    if (!campaign) throw new AppError('not_found', `Campaign ${id} does not exist`)
    return campaign
  }

  async overview(id: string) {
    const campaign = await this.getCampaign(id)
    const [allocations, publications] = await Promise.all([
      this.campaigns.listAllocations(id),
      this.campaigns.listPublications(id),
    ])
    const totals = { evm: { count: 0, amount: 0n }, solana: { count: 0, amount: 0n } }
    for (const allocation of allocations) {
      totals[allocation.family].count++
      totals[allocation.family].amount += allocation.amount
    }
    return { campaign, totals, publications, chains: this.chainList() }
  }

  chainList(): { chain: string; family: ChainFamily }[] {
    const evmChains = (this.evm?.supportedChains() ?? []).map((chain) => ({
      chain,
      family: 'evm' as const,
    }))
    const solanaChains = this.solana
      ? [{ chain: chains.solanaDevnet.caip2, family: 'solana' as const }]
      : []
    return [...evmChains, ...solanaChains]
  }

  async eligibility(campaignId: string, session: Session): Promise<ChainEligibility[]> {
    const campaign = await this.getCampaign(campaignId)
    const results: Promise<ChainEligibility>[] = []
    for (const { chain, family } of this.chainList()) {
      const account = session.accounts.find((item) => item.family === family)
      if (account) results.push(this.chainEligibility(campaign, chain, family, account.address))
    }
    return Promise.all(results)
  }

  async chainEligibility(
    campaign: Campaign,
    chain: string,
    family: ChainFamily,
    address: string,
  ): Promise<ChainEligibility> {
    const decimals = campaign.decimals[family]
    const base = {
      chain,
      family,
      address,
      decimals,
      allocated: '0',
      published: '0',
      claimed: '0',
      claimable: '0',
    }
    const allocation = await this.campaigns.findAllocation(campaign.id, family, address)
    if (!allocation) return { ...base, status: 'not_listed' }

    try {
      const onChain = await this.onChainState(chain, family, address)
      const snapshot = await this.campaigns.findSnapshot(campaign.id, family, onChain.root)
      const published = BigInt(snapshot?.entries[address] ?? '0')
      const claimable = published > onChain.claimed ? published - onChain.claimed : 0n
      const status: EligibilityStatus = onChain.paused
        ? 'paused'
        : claimable > 0n
          ? 'claimable'
          : published < allocation.amount
            ? 'pending_publication'
            : 'claimed'
      return {
        ...base,
        status,
        allocated: allocation.amount.toString(),
        published: published.toString(),
        claimed: onChain.claimed.toString(),
        claimable: claimable.toString(),
      }
    } catch {
      return {
        ...base,
        status: 'unavailable',
        allocated: allocation.amount.toString(),
        error: 'This network is not responding right now',
      }
    }
  }

  /** Proof against the root that is live on-chain right now, not the latest one in the database. */
  async proofFor(campaignId: string, chain: string, address: string): Promise<ProofResult> {
    const family = chainByCaip2(chain)?.family
    if (!family) throw new AppError('bad_request', `Unknown chain ${chain}`)
    const onChain = await this.onChainState(chain, family, address)
    const snapshot = await this.campaigns.findSnapshot(campaignId, family, onChain.root)
    const amount = snapshot?.entries[address]
    if (!snapshot || !amount) {
      const allocation = await this.campaigns.findAllocation(campaignId, family, address)
      throw allocation
        ? new AppError(
            'pending_publication',
            'Your allocation is being published on-chain. Try again in a few seconds.',
          )
        : new AppError('not_listed', 'This wallet is not on the whitelist')
    }
    if (onChain.paused) throw new AppError('claims_paused', 'Claims are paused for now')
    if (BigInt(amount) <= onChain.claimed) {
      throw new AppError('already_claimed', 'This wallet already claimed its allocation')
    }
    return {
      chain,
      address,
      amount: BigInt(amount),
      proof: proofFromSnapshot(snapshot, address),
      root: snapshot.root,
    }
  }

  async joinDemo(campaignId: string, session: Session): Promise<{ added: number }> {
    const campaign = await this.getCampaign(campaignId)
    if (!campaign.demoJoinOpen) throw new AppError('forbidden', 'The demo whitelist is closed')
    if (session.accounts.length === 0)
      throw new AppError('unauthorized', 'Sign in with a wallet first')

    const records: AllocationRecord[] = session.accounts.map((account) => ({
      campaignId,
      family: account.family,
      address: account.address,
      amount: parseUnits(campaign.demoAmount, campaign.decimals[account.family]),
      source: 'demo',
      addedAt: new Date(),
    }))
    const { added } = await this.campaigns.upsertAllocations(records)
    if (added > 0) this.publisher.schedule(campaignId)
    return { added }
  }

  async previewWhitelist(campaignId: string, csv: string) {
    const campaign = await this.getCampaign(campaignId)
    const parsed = parseWhitelist(csv, { decimals: campaign.decimals })
    return { ...summarize(parsed), roots: previewRoots(parsed) }
  }

  async importWhitelist(campaignId: string, csv: string) {
    const campaign = await this.getCampaign(campaignId)
    const parsed = parseWhitelist(csv, { decimals: campaign.decimals })
    if (parsed.entries.length === 0) {
      throw new AppError('bad_request', 'The file has no valid rows', parsed.issues.slice(0, 50))
    }
    const result = await this.campaigns.upsertAllocations(
      parsed.entries.map((entry) => ({
        campaignId,
        family: entry.family,
        address: entry.address,
        amount: entry.baseAmount,
        source: 'csv' as const,
        addedAt: new Date(),
      })),
    )
    this.publisher.schedule(campaignId)
    return { ...summarize(parsed), ...result }
  }

  private async onChainState(chain: string, family: ChainFamily, address: string) {
    if (family === 'evm') {
      if (!this.evm) throw new AppError('not_configured', 'EVM contracts are not configured')
      const [state, claimed] = await Promise.all([
        this.evm.distributorState(chain),
        this.evm.claimedAmount(chain, address),
      ])
      return { root: state.root, paused: state.paused, claimed }
    }
    if (!this.solana) throw new AppError('not_configured', 'The Solana program is not configured')
    const [state, claimed] = await Promise.all([
      this.solana.distributorState(),
      this.solana.claimedAmount(address),
    ])
    return { root: state.root, paused: state.paused, claimed }
  }
}

function proofFromSnapshot(snapshot: TreeSnapshot, address: string): string[] {
  const list = Object.entries(snapshot.entries).map(([entryAddress, amount]) => ({
    address: entryAddress,
    amount: BigInt(amount),
  }))
  if (snapshot.family === 'evm') {
    return buildEvmTree(list).proofFor(address)?.proof ?? []
  }
  const proof = buildSolanaTree(list).proofFor(address)?.proof ?? []
  return proof.map((node) => Buffer.from(node).toString('hex'))
}

function summarize(parsed: WhitelistParseResult) {
  return {
    valid: parsed.entries.length,
    issues: parsed.issues.slice(0, 50),
    issueCount: parsed.issues.length,
    totals: {
      evm: { count: parsed.totals.evm.count, amount: parsed.totals.evm.amount.toString() },
      solana: { count: parsed.totals.solana.count, amount: parsed.totals.solana.amount.toString() },
    },
  }
}

function previewRoots(parsed: WhitelistParseResult) {
  const byFamily = (family: ChainFamily) =>
    parsed.entries
      .filter((entry) => entry.family === family)
      .map((entry) => ({ address: entry.address, amount: entry.baseAmount }))
  const evm = byFamily('evm')
  const solana = byFamily('solana')
  return {
    evm: evm.length ? buildEvmTree(evm).root : null,
    solana: solana.length ? buildSolanaTree(solana).rootHex : null,
  }
}
