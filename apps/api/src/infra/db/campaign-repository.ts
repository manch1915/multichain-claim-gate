import type { ChainFamily } from '@mcg/core'
import { and, desc, eq, sql } from 'drizzle-orm'
import type {
  AllocationRecord,
  Campaign,
  RootPublication,
  TreeSnapshot,
} from '../../domain/models.js'
import type { CampaignRepository } from '../../ports/repositories.js'
import type { Db } from './client.js'
import { allocations, campaigns, rootPublications, treeSnapshots } from './schema.js'

export class DrizzleCampaignRepository implements CampaignRepository {
  constructor(private readonly db: Db) {}

  async findCampaign(id: string): Promise<Campaign | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.id, id))
    if (!row) return undefined
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      decimals: { evm: row.evmDecimals, solana: row.solanaDecimals },
      demoAmount: row.demoAmount,
      demoJoinOpen: row.demoJoinOpen,
    }
  }

  async upsertCampaign(campaign: Campaign): Promise<void> {
    const values = {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      evmDecimals: campaign.decimals.evm,
      solanaDecimals: campaign.decimals.solana,
      demoAmount: campaign.demoAmount,
      demoJoinOpen: campaign.demoJoinOpen,
    }
    await this.db
      .insert(campaigns)
      .values(values)
      .onConflictDoUpdate({ target: campaigns.id, set: values })
  }

  async listAllocations(campaignId: string, family?: ChainFamily): Promise<AllocationRecord[]> {
    const rows = await this.db
      .select()
      .from(allocations)
      .where(
        family
          ? and(eq(allocations.campaignId, campaignId), eq(allocations.family, family))
          : eq(allocations.campaignId, campaignId),
      )
      .orderBy(desc(allocations.addedAt))
    return rows.map(toAllocation)
  }

  async findAllocation(
    campaignId: string,
    family: ChainFamily,
    address: string,
  ): Promise<AllocationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(allocations)
      .where(
        and(
          eq(allocations.campaignId, campaignId),
          eq(allocations.family, family),
          eq(allocations.address, address),
        ),
      )
    return row ? toAllocation(row) : undefined
  }

  async upsertAllocations(records: AllocationRecord[]): Promise<{ added: number; raised: number }> {
    let added = 0
    let raised = 0
    await this.db.transaction(async (tx) => {
      for (const record of records) {
        const [existing] = await tx
          .select({ amount: allocations.amount })
          .from(allocations)
          .where(
            and(
              eq(allocations.campaignId, record.campaignId),
              eq(allocations.family, record.family),
              eq(allocations.address, record.address),
            ),
          )
        if (!existing) {
          await tx.insert(allocations).values({ ...record, amount: record.amount.toString() })
          added++
        } else if (BigInt(existing.amount) < record.amount) {
          await tx
            .update(allocations)
            .set({ amount: record.amount.toString(), source: record.source })
            .where(
              and(
                eq(allocations.campaignId, record.campaignId),
                eq(allocations.family, record.family),
                eq(allocations.address, record.address),
              ),
            )
          raised++
        }
      }
    })
    return { added, raised }
  }

  async saveSnapshot(snapshot: TreeSnapshot): Promise<void> {
    await this.db
      .insert(treeSnapshots)
      .values({ ...snapshot, total: snapshot.total.toString() })
      .onConflictDoNothing()
  }

  async findSnapshot(
    campaignId: string,
    family: ChainFamily,
    root: string,
  ): Promise<TreeSnapshot | undefined> {
    const [row] = await this.db
      .select()
      .from(treeSnapshots)
      .where(
        and(
          eq(treeSnapshots.campaignId, campaignId),
          eq(treeSnapshots.family, family),
          eq(sql`lower(${treeSnapshots.root})`, root.toLowerCase()),
        ),
      )
    return row ? toSnapshot(row) : undefined
  }

  async latestSnapshot(campaignId: string, family: ChainFamily): Promise<TreeSnapshot | undefined> {
    const [row] = await this.db
      .select()
      .from(treeSnapshots)
      .where(and(eq(treeSnapshots.campaignId, campaignId), eq(treeSnapshots.family, family)))
      .orderBy(desc(treeSnapshots.createdAt))
      .limit(1)
    return row ? toSnapshot(row) : undefined
  }

  async savePublication(publication: RootPublication): Promise<void> {
    await this.db
      .insert(rootPublications)
      .values(publication)
      .onConflictDoUpdate({
        target: [rootPublications.campaignId, rootPublications.chain],
        set: {
          root: publication.root,
          status: publication.status,
          txHash: publication.txHash,
          error: publication.error,
          updatedAt: publication.updatedAt,
        },
      })
  }

  async listPublications(campaignId: string): Promise<RootPublication[]> {
    return this.db
      .select()
      .from(rootPublications)
      .where(eq(rootPublications.campaignId, campaignId))
  }
}

function toAllocation(row: typeof allocations.$inferSelect): AllocationRecord {
  return { ...row, amount: BigInt(row.amount) }
}

function toSnapshot(row: typeof treeSnapshots.$inferSelect): TreeSnapshot {
  return { ...row, total: BigInt(row.total) }
}
