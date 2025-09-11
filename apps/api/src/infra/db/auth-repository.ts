import type { ChainFamily } from '@mcg/core'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import type { LinkedAccount, Session } from '../../domain/models.js'
import type { AuthRepository, NonceRecord } from '../../ports/repositories.js'
import type { Db } from './client.js'
import { authNonces, sessionAccounts, sessions } from './schema.js'

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db: Db) {}

  async saveNonce(record: NonceRecord): Promise<void> {
    await this.db.insert(authNonces).values(record)
  }

  async consumeNonce(nonce: string, now: Date): Promise<NonceRecord | undefined> {
    // Single conditional UPDATE, so two concurrent verifications cannot both win.
    const [row] = await this.db
      .update(authNonces)
      .set({ usedAt: now })
      .where(
        and(eq(authNonces.nonce, nonce), isNull(authNonces.usedAt), gt(authNonces.expiresAt, now)),
      )
      .returning()
    return row
      ? {
          nonce: row.nonce,
          accountId: row.accountId,
          message: row.message,
          expiresAt: row.expiresAt,
        }
      : undefined
  }

  async createSession(id: string, expiresAt: Date): Promise<void> {
    await this.db.insert(sessions).values({ id, expiresAt })
  }

  async findSession(id: string, now: Date): Promise<Session | undefined> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    if (!session) return undefined
    const accounts = await this.db
      .select()
      .from(sessionAccounts)
      .where(eq(sessionAccounts.sessionId, id))
    return {
      id: session.id,
      expiresAt: session.expiresAt,
      accounts: accounts.map((account) => ({
        family: account.family,
        chain: account.chain,
        address: account.address,
        verifiedAt: account.verifiedAt,
      })),
    }
  }

  async upsertAccount(sessionId: string, account: LinkedAccount): Promise<void> {
    await this.db
      .insert(sessionAccounts)
      .values({ sessionId, ...account })
      .onConflictDoUpdate({
        target: [sessionAccounts.sessionId, sessionAccounts.family],
        set: { chain: account.chain, address: account.address, verifiedAt: account.verifiedAt },
      })
  }

  async removeAccount(sessionId: string, family: ChainFamily): Promise<void> {
    await this.db
      .delete(sessionAccounts)
      .where(and(eq(sessionAccounts.sessionId, sessionId), eq(sessionAccounts.family, family)))
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id))
  }

  async purgeExpired(now: Date): Promise<void> {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, now))
    await this.db.delete(authNonces).where(lt(authNonces.expiresAt, now))
  }
}
