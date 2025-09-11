import { randomUUID } from 'node:crypto'
import { rule as ruleSchema } from '@mcg/core'
import { asc, eq, sql } from 'drizzle-orm'
import type { Gate, GateContent } from '../../domain/models.js'
import type { GateRepository } from '../../ports/repositories.js'
import type { Db } from './client.js'
import { gateChecks, gates } from './schema.js'

export class DrizzleGateRepository implements GateRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<Gate[]> {
    const rows = await this.db.select().from(gates).orderBy(asc(gates.id))
    return rows.map(toGate)
  }

  async find(id: string): Promise<Gate | undefined> {
    const [row] = await this.db.select().from(gates).where(eq(gates.id, id))
    return row ? toGate(row) : undefined
  }

  async upsert(gate: Gate): Promise<void> {
    await this.db
      .insert(gates)
      .values(gate)
      .onConflictDoUpdate({
        target: gates.id,
        set: {
          title: gate.title,
          summary: gate.summary,
          rule: gate.rule,
          content: gate.content,
          telegramEnabled: gate.telegramEnabled,
          updatedAt: gate.updatedAt,
        },
      })
  }

  async recordCheck(gateId: string, accounts: string[], passed: boolean): Promise<void> {
    await this.db.insert(gateChecks).values({ id: randomUUID(), gateId, accounts, passed })
  }

  async checkStats(): Promise<{ gateId: string; checks: number; passed: number }[]> {
    const rows = await this.db
      .select({
        gateId: gateChecks.gateId,
        checks: sql<number>`count(*)::int`,
        passed: sql<number>`count(*) filter (where ${gateChecks.passed})::int`,
      })
      .from(gateChecks)
      .groupBy(gateChecks.gateId)
    return rows.map((row) => ({ ...row, checks: Number(row.checks), passed: Number(row.passed) }))
  }
}

function toGate(row: typeof gates.$inferSelect): Gate {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    rule: ruleSchema.parse(row.rule),
    content: row.content as GateContent,
    telegramEnabled: row.telegramEnabled,
    updatedAt: row.updatedAt,
  }
}
