import type { ChainFamily, EvaluationResult, Rule } from '@mcg/core'

export interface LinkedAccount {
  family: ChainFamily
  /** CAIP-2 chain the account signed in on. */
  chain: string
  address: string
  verifiedAt: Date
}

export interface Session {
  id: string
  accounts: LinkedAccount[]
  expiresAt: Date
}

export interface Campaign {
  id: string
  name: string
  description: string
  decimals: Record<ChainFamily, number>
  demoAmount: string
  demoJoinOpen: boolean
}

export interface AllocationRecord {
  campaignId: string
  family: ChainFamily
  address: string
  amount: bigint
  source: 'csv' | 'demo' | 'seed'
  addedAt: Date
}

export interface TreeSnapshot {
  campaignId: string
  family: ChainFamily
  root: string
  size: number
  total: bigint
  entries: Record<string, string>
  createdAt: Date
}

export type PublicationStatus = 'pending' | 'sent' | 'confirmed' | 'failed'

export interface RootPublication {
  campaignId: string
  chain: string
  root: string
  status: PublicationStatus
  txHash: string | null
  error: string | null
  updatedAt: Date
}

export type ActionKind = 'airdrop' | 'pass'
export type ActionMethod =
  'sponsored-userop' | 'sponsor-tx' | 'wallet-paymaster' | 'solana-fee-payer'
export type ActionStatus = 'pending' | 'confirmed' | 'failed'

export interface SponsoredAction {
  id: string
  kind: ActionKind
  campaignId: string | null
  chain: string
  address: string
  amount: bigint | null
  method: ActionMethod
  status: ActionStatus
  txHash: string | null
  userOpHash: string | null
  error: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GateContent {
  heading: string
  body: string
  links: { label: string; href: string }[]
}

export interface Gate {
  id: string
  title: string
  summary: string
  rule: Rule
  content: GateContent
  telegramEnabled: boolean
  updatedAt: Date
}

export interface GateCheck {
  gateId: string
  passed: boolean
  result: EvaluationResult
}
