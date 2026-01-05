import { PGlite } from '@electric-sql/pglite'
import { chains, verifySolanaProof } from '@mcg/core'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { decodeFunctionData, type Hex } from 'viem'
import type { FastifyInstance } from 'fastify'
import { ensureDemoData } from '../src/bootstrap.js'
import type { Config } from '../src/config.js'
import { createContainer, type Container, type Infrastructure } from '../src/container.js'
import { DrizzleCampaignRepository } from '../src/infra/db/campaign-repository.js'
import { migrationsFolder, type Db } from '../src/infra/db/client.js'
import { DrizzleGateRepository } from '../src/infra/db/gate-repository.js'
import * as schema from '../src/infra/db/schema.js'
import { accessPassAbi, distributorAbi } from '../src/infra/evm/abis.js'
import { encodeClaim, encodeMintPass, encodeSetRoot } from '../src/infra/evm/calls.js'
import { MultichainSignatureVerifier } from '../src/infra/siwx/verifier.js'
import { buildServer } from '../src/http/server.js'
import type {
  BalanceReader,
  EvmCall,
  EvmGateway,
  EvmSponsor,
  PreparedSolanaClaim,
  SolanaGateway,
  SponsorSubmission,
} from '../src/ports/chains.js'
import { silentLogger } from '../src/services/logger.js'

export const BASE = chains.baseSepolia.caip2
export const SEPOLIA = chains.sepolia.caip2
export const DEVNET = chains.solanaDevnet.caip2

const DISTRIBUTOR = '0x00000000000000000000000000000000000d1570' as const
const PASS = '0x0000000000000000000000000000000000000a55' as const
const TOKEN = '0x000000000000000000000000000000000000700c' as const

/**
 * In-memory PGlite by default. With TEST_DATABASE_URL set, each call gets its own database in a
 * real Postgres through postgres-js, which catches driver differences PGlite hides (CI runs both).
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.TEST_DATABASE_URL
  if (url) {
    // A database per test app: the generated migrations reference the public schema explicitly.
    const name = `test_${randomUUID().replace(/-/g, '')}`
    const admin = postgres(url, { max: 1, onnotice: () => undefined })
    await admin.unsafe(`create database "${name}"`)
    const target = new URL(url)
    target.pathname = `/${name}`
    const client = postgres(target.toString(), { max: 4, onnotice: () => undefined })
    const db = drizzlePostgres(client, { schema })
    await migratePostgres(db, { migrationsFolder })
    return {
      db: db as unknown as Db,
      close: async () => {
        await client.end({ timeout: 5 })
        await admin.unsafe(`drop database "${name}" with (force)`)
        await admin.end({ timeout: 5 })
      },
    }
  }

  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  // Each PGlite instance holds a large WASM heap, so tests must close it.
  return { db: db as unknown as Db, close: () => client.close() }
}

export function testConfig(overrides: Partial<Config['env']> = {}): Config {
  return {
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 0,
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'pglite://memory',
      PUBLIC_ORIGIN: 'http://localhost:3000',
      SESSION_TTL_HOURS: 24,
      APP_SECRET: 'test-secret-that-is-long-enough-for-hmac-signing',
      ADMIN_ADDRESSES: [],
      SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
      BASE_SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
      ANVIL_RPC_URL: undefined,
      SOLANA_RPC_URL: 'http://127.0.0.1:1',
      SPONSOR_PRIVATE_KEY: undefined,
      PIMLICO_API_KEY: undefined,
      PIMLICO_SPONSORSHIP_POLICY_ID: undefined,
      SOLANA_FEE_PAYER_SECRET: undefined,
      DEPLOYMENTS_FILE: '',
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
      DEMO_CAMPAIGN_ID: 'meridian-genesis',
      ROOT_PUBLISH_DEBOUNCE_MS: 0,
      ...overrides,
    },
    deployments: {
      evm: {
        '84532': { chainId: 84532, token: TOKEN, distributor: DISTRIBUTOR, accessPass: PASS },
      },
      solana: {
        programId: '75kikp9KzBBAoefQopScXtnT4NpLJ54ZbRTSAAduPvdb',
        mint: 'So11111111111111111111111111111111111111112',
        distributor: 'Sysvar1nstructions1111111111111111111111111',
        vault: 'SysvarRent111111111111111111111111111111111',
        authority: '11111111111111111111111111111111',
        decimals: 6,
      },
    },
  }
}

/** In-memory stand-in for the deployed distributor and pass contracts on Base Sepolia. */
export class FakeEvm implements EvmGateway {
  root: Hex = `0x${'00'.repeat(32)}`
  paused = false
  claimed = new Map<string, bigint>()
  passes = new Set<string>()

  supportedChains() {
    return [BASE]
  }
  passChain() {
    return BASE
  }
  setRootCall(_chain: string, root: string): EvmCall {
    return encodeSetRoot(DISTRIBUTOR, root)
  }
  claimCall(_chain: string, account: string, amount: bigint, proof: Hex[]): EvmCall {
    return encodeClaim(DISTRIBUTOR, account, amount, proof)
  }
  mintPassCall(_chain: string, to: string): EvmCall {
    return encodeMintPass(PASS, to)
  }
  async distributorState() {
    return { root: this.root, paused: this.paused }
  }
  async claimedAmount(_chain: string, account: string) {
    return this.claimed.get(account.toLowerCase()) ?? 0n
  }
  async simulateClaim() {}
  async hasPass(_chain: string, account: string) {
    return this.passes.has(account.toLowerCase())
  }

  apply(call: EvmCall) {
    if (call.to === DISTRIBUTOR) {
      const decoded = decodeFunctionData({ abi: distributorAbi, data: call.data })
      if (decoded.functionName === 'setMerkleRoot') this.root = decoded.args[0]
      if (decoded.functionName === 'claim') {
        const [account, amount] = decoded.args
        this.claimed.set(account.toLowerCase(), amount)
      }
    } else if (call.to === PASS) {
      const decoded = decodeFunctionData({ abi: accessPassAbi, data: call.data })
      if (decoded.functionName === 'mintTo') this.passes.add(decoded.args[0].toLowerCase())
    }
  }
}

export class FakeSponsor implements EvmSponsor {
  readonly address = '0x000000000000000000000000000000000000beef' as const
  readonly method = 'sponsored-userop' as const
  submitted: EvmCall[] = []
  failNext = false

  constructor(private readonly evm: FakeEvm) {}

  async submit(_chain: string, calls: EvmCall[]): Promise<SponsorSubmission> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('bundler unavailable')
    }
    this.submitted.push(...calls)
    calls.forEach((call) => this.evm.apply(call))
    const hash = `0x${(this.submitted.length + 1).toString(16).padStart(64, '0')}`
    return { method: this.method, hash, wait: async () => ({ success: true, txHash: hash }) }
  }
}

export class FakeSolana implements SolanaGateway {
  readonly feePayer = 'FeePayer11111111111111111111111111111111111'
  root = '00'.repeat(32)
  claimed = new Map<string, bigint>()
  lastPrepared: { claimant: string; amount: bigint; proof: Uint8Array[] } | undefined
  lastMessage = ''

  /** What a wallet would send back after signing the last prepared transaction. */
  walletSigned(): string {
    return `signed-by-wallet:${this.lastMessage}`
  }

  async distributorState() {
    return { root: this.root, version: 1n, paused: false }
  }
  async claimedAmount(claimant: string) {
    return this.claimed.get(claimant) ?? 0n
  }
  async prepareClaim(
    claimant: string,
    amount: bigint,
    proof: Uint8Array[],
  ): Promise<PreparedSolanaClaim> {
    this.lastPrepared = { claimant, amount, proof }
    const message = Buffer.from(`claim:${claimant}:${amount}:${'0'.repeat(64)}`).toString('base64')
    this.lastMessage = message
    return {
      transactionBase64: `signed-by-nobody:${message}`,
      messageBase64: message,
      lastValidBlockHeight: 1n,
    }
  }
  async submitClaim(signed: string, expectedMessage: string) {
    if (signed !== `signed-by-wallet:${expectedMessage}`) throw new Error('mismatch')
    const prepared = this.lastPrepared!
    const ok = verifySolanaProof(
      Buffer.from(this.root, 'hex'),
      prepared.claimant,
      prepared.amount,
      prepared.proof,
    )
    if (!ok) throw new Error('InvalidProof')
    this.claimed.set(prepared.claimant, prepared.amount)
    return '5ignature'
  }
  async confirm() {
    return true
  }
  async updateRoot(root: Uint8Array) {
    this.root = Buffer.from(root).toString('hex')
    return 'rootSignature'
  }
}

export class FakeBalances implements BalanceReader {
  values = new Map<string, bigint>()
  set(kind: string, address: string, value: bigint) {
    this.values.set(`${kind}:${address.toLowerCase()}`, value)
  }
  private get(kind: string, address: string) {
    return this.values.get(`${kind}:${address.toLowerCase()}`) ?? 0n
  }
  async native(_chain: string, address: string) {
    return this.get('native', address)
  }
  async erc20(_chain: string, _token: string, address: string) {
    return this.get('erc20', address)
  }
  async erc721(_chain: string, _collection: string, address: string) {
    return this.get('erc721', address)
  }
  async spl(_chain: string, _mint: string, owner: string) {
    return this.get('spl', owner)
  }
}

export interface TestApp {
  app: FastifyInstance
  container: Container
  evm: FakeEvm
  sponsor: FakeSponsor
  solana: FakeSolana
  balances: FakeBalances
  db: Db
  close: () => Promise<void>
}

export async function createTestApp(overrides: Partial<Config['env']> = {}): Promise<TestApp> {
  const config = testConfig(overrides)
  const { db, close: closeDb } = await createTestDb()
  await ensureDemoData(config, new DrizzleCampaignRepository(db), new DrizzleGateRepository(db))

  const evm = new FakeEvm()
  const sponsor = new FakeSponsor(evm)
  const solana = new FakeSolana()
  const balances = new FakeBalances()
  const infra: Infrastructure = {
    evm,
    sponsor,
    solana,
    balances,
    history: { history: async () => [] },
    prices: { prices: async () => ({ ETH: 2500, SOL: 150 }) },
    telegram: {
      enabled: true,
      createInvite: async () => ({
        url: 'https://t.me/+invite',
        expiresAt: new Date(Date.now() + 900_000),
      }),
    },
    verifier: new MultichainSignatureVerifier(new Map()),
    paymasterUpstream: {
      forward: async (_chainId, body) => ({
        jsonrpc: '2.0',
        id: (body as { id: number }).id,
        result: { paymaster: '0xpm' },
      }),
    },
    portfolioChains: [BASE, DEVNET],
    trackedAssets: [],
    distributorsByChainId: new Map([[84532, DISTRIBUTOR]]),
  }
  const container = createContainer(config, db, infra, silentLogger)
  const app = await buildServer(container, { logger: false })
  const close = async () => {
    container.publisher.stop()
    await app.close()
    await closeDb()
  }
  return { app, container, evm, sponsor, solana, balances, db, close }
}

export function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie']
  const value = Array.isArray(header) ? header[0] : header
  return String(value).split(';')[0] ?? ''
}
