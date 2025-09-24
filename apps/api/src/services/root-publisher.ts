import { buildEvmTree, buildSolanaTree, chains, type ChainFamily } from '@mcg/core'
import type { AllocationRecord, TreeSnapshot } from '../domain/models.js'
import { safeErrorMessage } from '../domain/safe-error.js'
import type { EvmGateway, EvmSponsor, SolanaGateway } from '../ports/chains.js'
import type { CampaignRepository } from '../ports/repositories.js'
import type { Logger } from './logger.js'

export interface PublisherDeps {
  campaigns: CampaignRepository
  evm: EvmGateway | undefined
  sponsor: EvmSponsor | undefined
  solana: SolanaGateway | undefined
  logger: Logger
  debounceMs: number
}

/**
 * Rebuilds Merkle trees from the allocation table and pushes new roots on-chain.
 * Calls are debounced per campaign, so a burst of demo sign-ups becomes a single update.
 */
export class RootPublisher {
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly running = new Map<string, Promise<void>>()
  private readonly rerun = new Set<string>()

  constructor(private readonly deps: PublisherDeps) {}

  schedule(campaignId: string): void {
    clearTimeout(this.timers.get(campaignId))
    this.timers.set(
      campaignId,
      setTimeout(() => {
        this.timers.delete(campaignId)
        void this.publish(campaignId)
      }, this.deps.debounceMs),
    )
  }

  async publish(campaignId: string): Promise<void> {
    const current = this.running.get(campaignId)
    if (current) {
      this.rerun.add(campaignId)
      return current
    }
    const run = this.publishOnce(campaignId)
      .catch((error: unknown) => {
        this.deps.logger.error({ err: error, campaignId }, 'root publication failed')
      })
      .finally(() => {
        this.running.delete(campaignId)
        if (this.rerun.delete(campaignId)) void this.publish(campaignId)
      })
    this.running.set(campaignId, run)
    return run
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private async publishOnce(campaignId: string): Promise<void> {
    const all = await this.deps.campaigns.listAllocations(campaignId)
    for (const family of ['evm', 'solana'] as const) {
      const allocations = all.filter((allocation) => allocation.family === family)
      if (allocations.length === 0) continue
      const snapshot = buildSnapshot(campaignId, family, allocations)
      await this.deps.campaigns.saveSnapshot(snapshot)
      if (family === 'evm') await this.publishEvm(campaignId, snapshot)
      else await this.publishSolana(campaignId, snapshot)
    }
  }

  private async publishEvm(campaignId: string, snapshot: TreeSnapshot): Promise<void> {
    const { evm, sponsor } = this.deps
    if (!evm || !sponsor) return
    await Promise.all(
      evm.supportedChains().map(async (chain) => {
        const state = await evm.distributorState(chain)
        if (state.root.toLowerCase() === snapshot.root.toLowerCase()) return

        await this.record(campaignId, chain, snapshot.root, 'pending')
        try {
          const submission = await sponsor.submit(chain, [evm.setRootCall(chain, snapshot.root)])
          await this.record(campaignId, chain, snapshot.root, 'sent', submission.hash)
          const receipt = await submission.wait()
          await this.record(
            campaignId,
            chain,
            snapshot.root,
            receipt.success ? 'confirmed' : 'failed',
            receipt.txHash,
            receipt.success ? null : 'Root update reverted',
          )
        } catch (error) {
          await this.record(
            campaignId,
            chain,
            snapshot.root,
            'failed',
            null,
            safeErrorMessage(error),
          )
          throw error
        }
      }),
    )
  }

  private async publishSolana(campaignId: string, snapshot: TreeSnapshot): Promise<void> {
    const { solana } = this.deps
    if (!solana) return
    const chain = chains.solanaDevnet.caip2
    const state = await solana.distributorState()
    if (state.root === snapshot.root) return

    await this.record(campaignId, chain, snapshot.root, 'pending')
    try {
      const signature = await solana.updateRoot(Buffer.from(snapshot.root, 'hex'))
      await this.record(campaignId, chain, snapshot.root, 'sent', signature)
      const ok = await solana.confirm(signature)
      await this.record(campaignId, chain, snapshot.root, ok ? 'confirmed' : 'failed', signature)
    } catch (error) {
      await this.record(campaignId, chain, snapshot.root, 'failed', null, safeErrorMessage(error))
      throw error
    }
  }

  private record(
    campaignId: string,
    chain: string,
    root: string,
    status: 'pending' | 'sent' | 'confirmed' | 'failed',
    txHash: string | null = null,
    error: string | null = null,
  ) {
    return this.deps.campaigns.savePublication({
      campaignId,
      chain,
      root,
      status,
      txHash,
      error,
      updatedAt: new Date(),
    })
  }
}

export function buildSnapshot(
  campaignId: string,
  family: ChainFamily,
  allocations: AllocationRecord[],
): TreeSnapshot {
  const list = allocations.map(({ address, amount }) => ({ address, amount }))
  const root = family === 'evm' ? buildEvmTree(list).root : buildSolanaTree(list).rootHex
  return {
    campaignId,
    family,
    root,
    size: list.length,
    total: list.reduce((sum, item) => sum + item.amount, 0n),
    entries: Object.fromEntries(list.map((item) => [item.address, item.amount.toString()])),
    createdAt: new Date(),
  }
}
