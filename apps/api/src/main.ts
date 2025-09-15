import { pino } from 'pino'
import { ensureDemoData } from './bootstrap.js'
import { loadConfig } from './config.js'
import { createContainer, createInfrastructure } from './container.js'
import { connectPostgres } from './infra/db/client.js'
import { DrizzleAuthRepository } from './infra/db/auth-repository.js'
import { DrizzleCampaignRepository } from './infra/db/campaign-repository.js'
import { DrizzleGateRepository } from './infra/db/gate-repository.js'
import { buildServer } from './http/server.js'

const config = loadConfig()
const logger = pino({ level: config.env.LOG_LEVEL })

const { db, close } = await connectPostgres(config.env.DATABASE_URL)
await ensureDemoData(config, new DrizzleCampaignRepository(db), new DrizzleGateRepository(db))

const infra = await createInfrastructure(config)
const container = createContainer(config, db, infra, logger)
const app = await buildServer(container, { loggerInstance: logger })

logger.info(
  {
    evmChains: infra.evm?.supportedChains() ?? [],
    solana: Boolean(infra.solana),
    sponsor: infra.sponsor?.method ?? 'disabled',
    telegram: infra.telegram.enabled,
  },
  'starting api',
)

await app.listen({ host: config.env.HOST, port: config.env.PORT })

// Catch up on any whitelist changes that were not published before the last restart.
void container.publisher.publish(config.env.DEMO_CAMPAIGN_ID)

const auth = new DrizzleAuthRepository(db)
const purge = setInterval(
  () => void auth.purgeExpired(new Date()).catch(() => undefined),
  3_600_000,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(purge)
    container.publisher.stop()
    void app
      .close()
      .then(close)
      .finally(() => process.exit(0))
  })
}
