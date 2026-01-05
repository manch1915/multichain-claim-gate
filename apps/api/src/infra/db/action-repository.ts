import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { ActionStatus, SponsoredAction } from '../../domain/models.js'
import type {
  ActionRepository,
  PreparedTransaction,
  PreparedTransactionRepository,
} from '../../ports/repositories.js'
import type { Db } from './client.js'
import { preparedTransactions, sponsoredActions } from './schema.js'

export class DrizzleActionRepository implements ActionRepository {
  constructor(private readonly db: Db) {}

  async create(action: SponsoredAction): Promise<void> {
    await this.db
      .insert(sponsoredActions)
      .values({ ...action, amount: action.amount === null ? null : action.amount.toString() })
  }

  async update(
    id: string,
    patch: Partial<Pick<SponsoredAction, 'status' | 'txHash' | 'userOpHash' | 'error'>>,
  ): Promise<void> {
    await this.db
      .update(sponsoredActions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sponsoredActions.id, id))
  }

  async find(id: string): Promise<SponsoredAction | undefined> {
    const [row] = await this.db.select().from(sponsoredActions).where(eq(sponsoredActions.id, id))
    return row ? toAction(row) : undefined
  }

  async findActive(
    kind: SponsoredAction['kind'],
    chain: string,
    address: string,
  ): Promise<SponsoredAction | undefined> {
    const [row] = await this.db
      .select()
      .from(sponsoredActions)
      .where(
        and(
          eq(sponsoredActions.kind, kind),
          eq(sponsoredActions.chain, chain),
          eq(sponsoredActions.address, address),
          inArray(sponsoredActions.status, ['pending']),
        ),
      )
      .orderBy(desc(sponsoredActions.createdAt))
      .limit(1)
    return row ? toAction(row) : undefined
  }

  async listRecent(limit: number): Promise<SponsoredAction[]> {
    const rows = await this.db
      .select()
      .from(sponsoredActions)
      .orderBy(desc(sponsoredActions.createdAt))
      .limit(limit)
    return rows.map(toAction)
  }

  async stats() {
    const rows = await this.db
      .select({
        kind: sponsoredActions.kind,
        chain: sponsoredActions.chain,
        method: sponsoredActions.method,
        status: sponsoredActions.status,
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${sponsoredActions.amount}), 0)::text`,
      })
      .from(sponsoredActions)
      .groupBy(
        sponsoredActions.kind,
        sponsoredActions.chain,
        sponsoredActions.method,
        sponsoredActions.status,
      )
    return rows.map((row) => ({
      ...row,
      status: row.status as ActionStatus,
      count: Number(row.count),
      amount: BigInt(row.amount),
    }))
  }
}

function toAction(row: typeof sponsoredActions.$inferSelect): SponsoredAction {
  return { ...row, amount: row.amount === null ? null : BigInt(row.amount) }
}

export class DrizzlePreparedTransactionRepository implements PreparedTransactionRepository {
  constructor(private readonly db: Db) {}

  async save(record: PreparedTransaction): Promise<void> {
    await this.db
      .insert(preparedTransactions)
      .values({ ...record, amount: record.amount.toString() })
  }

  async take(id: string, sessionId: string, now: Date): Promise<PreparedTransaction | undefined> {
    const [row] = await this.db
      .update(preparedTransactions)
      .set({ usedAt: now })
      .where(
        and(
          eq(preparedTransactions.id, id),
          eq(preparedTransactions.sessionId, sessionId),
          isNull(preparedTransactions.usedAt),
          gt(preparedTransactions.expiresAt, now),
        ),
      )
      .returning()
    if (!row) return undefined
    return {
      id: row.id,
      sessionId: row.sessionId,
      address: row.address,
      campaignId: row.campaignId,
      amount: BigInt(row.amount),
      messageBase64: row.messageBase64,
      expiresAt: row.expiresAt,
    }
  }
}
