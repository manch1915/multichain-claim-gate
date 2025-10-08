import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))

export async function connectPostgres(
  url: string,
): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = postgres(url, { max: 10, onnotice: () => undefined })
  const db = drizzle(client, { schema })
  await withRetry(() => migrate(db, { migrationsFolder }))
  return { db, close: () => client.end({ timeout: 5 }) }
}

/** Postgres refuses connections for a few seconds after a cold start, so wait for it. */
async function withRetry<T>(task: () => Promise<T>, attempts = 10, delayMs = 2000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task()
    } catch (error) {
      if (attempt >= attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
