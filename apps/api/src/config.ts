import { readFileSync } from 'node:fs'
import { z } from 'zod'

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a 0x-prefixed 32-byte hex key')
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1),
  /** Origin the web app is served from; goes into SIWE/SIWS messages and cookie settings. */
  PUBLIC_ORIGIN: z.url().default('http://localhost:3000'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 7),
  /** Secret for short-lived paymaster tokens. */
  APP_SECRET: z.string().min(32),
  ADMIN_ADDRESSES: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),

  SEPOLIA_RPC_URL: z.url().default('https://ethereum-sepolia-rpc.publicnode.com'),
  BASE_SEPOLIA_RPC_URL: z.url().default('https://sepolia.base.org'),
  ANVIL_RPC_URL: optional(z.url()),
  SOLANA_RPC_URL: z.url().default('https://api.devnet.solana.com'),

  /** Owner of the distributor and pass contracts. With a Pimlico key it acts as a 7702 smart account. */
  SPONSOR_PRIVATE_KEY: optional(hex32),
  PIMLICO_API_KEY: optional(z.string().min(8)),
  PIMLICO_SPONSORSHIP_POLICY_ID: optional(z.string()),
  /** Base58 secret or a JSON byte array, as written by solana-keygen. */
  SOLANA_FEE_PAYER_SECRET: optional(z.string().min(32)),

  DEPLOYMENTS_FILE: z.string().default('./deployments.json'),

  TELEGRAM_BOT_TOKEN: optional(z.string()),
  TELEGRAM_CHAT_ID: optional(z.string()),

  DEMO_CAMPAIGN_ID: z.string().default('meridian-genesis'),
  ROOT_PUBLISH_DEBOUNCE_MS: z.coerce.number().int().min(0).default(4000),
})

export type Env = z.infer<typeof envSchema>

const evmDeployment = z.object({
  chainId: z.number().int(),
  token: evmAddress,
  distributor: evmAddress,
  accessPass: evmAddress,
  sponsor: evmAddress.optional(),
})

const solanaDeployment = z.object({
  programId: z.string(),
  mint: z.string(),
  distributor: z.string(),
  vault: z.string(),
  authority: z.string(),
  decimals: z.number().int(),
})

export const deploymentsSchema = z.object({
  evm: z.record(z.string(), evmDeployment).default({}),
  solana: solanaDeployment.optional(),
})

export type Deployments = z.infer<typeof deploymentsSchema>
export type EvmDeployment = z.infer<typeof evmDeployment>
export type SolanaDeployment = z.infer<typeof solanaDeployment>

export interface Config {
  env: Env
  deployments: Deployments
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid environment:\n${details.join('\n')}`)
  }
  return { env: parsed.data, deployments: readDeployments(parsed.data.DEPLOYMENTS_FILE) }
}

function readDeployments(path: string): Deployments {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return { evm: {} }
  }
  return deploymentsSchema.parse(JSON.parse(raw))
}
