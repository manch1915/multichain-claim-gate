import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const amount = (name: string) => numeric(name, { precision: 78, scale: 0 })

export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  accountId: text('account_id').notNull(),
  message: text('message').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const sessionAccounts = pgTable(
  'session_accounts',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    family: text('family', { enum: ['evm', 'solana'] }).notNull(),
    chain: text('chain').notNull(),
    address: text('address').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.family] })],
)

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  evmDecimals: integer('evm_decimals').notNull(),
  solanaDecimals: integer('solana_decimals').notNull(),
  demoAmount: text('demo_amount').notNull(),
  demoJoinOpen: boolean('demo_join_open').notNull().default(true),
  createdAt: createdAt(),
})

export const allocations = pgTable(
  'allocations',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    family: text('family', { enum: ['evm', 'solana'] }).notNull(),
    address: text('address').notNull(),
    amount: amount('amount').notNull(),
    source: text('source', { enum: ['csv', 'demo', 'seed'] }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.family, table.address] })],
)

export const treeSnapshots = pgTable(
  'tree_snapshots',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    family: text('family', { enum: ['evm', 'solana'] }).notNull(),
    root: text('root').notNull(),
    size: integer('size').notNull(),
    total: amount('total').notNull(),
    entries: jsonb('entries').$type<Record<string, string>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.family, table.root] }),
    index('tree_snapshots_latest').on(table.campaignId, table.family, table.createdAt),
  ],
)

export const rootPublications = pgTable(
  'root_publications',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    chain: text('chain').notNull(),
    root: text('root').notNull(),
    status: text('status', { enum: ['pending', 'sent', 'confirmed', 'failed'] }).notNull(),
    txHash: text('tx_hash'),
    error: text('error'),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.chain] })],
)

export const sponsoredActions = pgTable(
  'sponsored_actions',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['airdrop', 'pass'] }).notNull(),
    campaignId: text('campaign_id'),
    chain: text('chain').notNull(),
    address: text('address').notNull(),
    amount: amount('amount'),
    method: text('method', {
      enum: ['sponsored-userop', 'sponsor-tx', 'wallet-paymaster', 'solana-fee-payer'],
    }).notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'failed'] }).notNull(),
    txHash: text('tx_hash'),
    userOpHash: text('user_op_hash'),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('sponsored_actions_lookup').on(table.kind, table.chain, table.address),
    index('sponsored_actions_recent').on(table.createdAt),
  ],
)

export const preparedTransactions = pgTable('prepared_transactions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  campaignId: text('campaign_id').notNull(),
  amount: amount('amount').notNull(),
  messageBase64: text('message_base64').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const gates = pgTable('gates', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  rule: jsonb('rule').notNull(),
  content: jsonb('content').notNull(),
  telegramEnabled: boolean('telegram_enabled').notNull().default(false),
  updatedAt: updatedAt(),
})

export const gateChecks = pgTable(
  'gate_checks',
  {
    id: text('id').primaryKey(),
    gateId: text('gate_id')
      .notNull()
      .references(() => gates.id, { onDelete: 'cascade' }),
    accounts: jsonb('accounts').$type<string[]>().notNull(),
    passed: boolean('passed').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('gate_checks_gate').on(table.gateId)],
)
