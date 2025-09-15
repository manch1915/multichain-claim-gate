import type { ActionRepository, CampaignRepository, GateRepository } from '../ports/repositories.js'

export class AdminService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly actions: ActionRepository,
    private readonly gates: GateRepository,
  ) {}

  async dashboard(campaignId: string) {
    const [allocations, publications, actionStats, recent, gateStats] = await Promise.all([
      this.campaigns.listAllocations(campaignId),
      this.campaigns.listPublications(campaignId),
      this.actions.stats(),
      this.actions.listRecent(25),
      this.gates.checkStats(),
    ])

    const bySource = { csv: 0, demo: 0, seed: 0 }
    for (const allocation of allocations) bySource[allocation.source]++

    return {
      allocations: {
        total: allocations.length,
        evm: allocations.filter((item) => item.family === 'evm').length,
        solana: allocations.filter((item) => item.family === 'solana').length,
        bySource,
        latest: allocations.slice(0, 20).map((item) => ({
          family: item.family,
          address: item.address,
          amount: item.amount.toString(),
          source: item.source,
          addedAt: item.addedAt,
        })),
      },
      publications,
      actions: actionStats.map((row) => ({ ...row, amount: row.amount.toString() })),
      recent: recent.map((item) => ({ ...item, amount: item.amount?.toString() ?? null })),
      gates: gateStats,
    }
  }
}
