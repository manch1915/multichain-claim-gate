import type { ChainFamily, EvaluationResult, Rule } from '@mcg/core'

export interface SessionAccount {
  family: ChainFamily
  chain: string
  address: string
}

export interface SessionView {
  accounts: SessionAccount[]
  isAdmin: boolean
  expiresAt: string
}

export type EligibilityStatus =
  'not_listed' | 'pending_publication' | 'claimable' | 'claimed' | 'paused' | 'unavailable'

export interface ChainEligibility {
  chain: string
  family: ChainFamily
  address: string
  status: EligibilityStatus
  allocated: string
  published: string
  claimed: string
  claimable: string
  decimals: number
  error?: string
}

export interface Publication {
  chain: string
  root: string
  status: 'pending' | 'sent' | 'confirmed' | 'failed'
  txHash: string | null
  error: string | null
  updatedAt: string
}

export interface CampaignOverview {
  campaign: {
    id: string
    name: string
    description: string
    decimals: Record<ChainFamily, number>
    demoAmount: string
    demoJoinOpen: boolean
  }
  totals: Record<ChainFamily, { count: number; amount: string }>
  publications: Publication[]
  chains: { chain: string; family: ChainFamily }[]
}

export interface ActionView {
  id: string
  kind: 'airdrop' | 'pass'
  chain: string
  address: string
  amount: string | null
  method: 'sponsored-userop' | 'sponsor-tx' | 'wallet-paymaster' | 'solana-fee-payer'
  status: 'pending' | 'confirmed' | 'failed'
  txHash: string | null
  userOpHash: string | null
  error: string | null
  createdAt: string
}

export interface GateSummary {
  id: string
  title: string
  summary: string
  rule: Rule
  telegramEnabled: boolean
  updatedAt: string
}

export interface GateCheck {
  gate: { id: string; title: string; summary: string; rule: Rule }
  gateId: string
  passed: boolean
  result: EvaluationResult
  content: { heading: string; body: string; links: { label: string; href: string }[] } | null
  telegramAvailable: boolean
}

export interface AssetBalance {
  symbol: string
  name: string
  kind: 'native' | 'erc20' | 'erc721' | 'spl'
  address: string | null
  decimals: number
  balance: string
  error?: string
}

export interface TxHistoryItem {
  chain: string
  hash: string
  timestamp: string | null
  direction: 'in' | 'out' | 'self'
  summary: string
  status: 'success' | 'failed'
  url: string
}

export interface ChainPortfolio {
  chain: string
  name: string
  address: string
  assets: AssetBalance[]
  history: TxHistoryItem[]
  historyError?: string
}

export interface Portfolio {
  chains: ChainPortfolio[]
  referencePrices: Record<string, number>
  updatedAt: string
}

export interface WhitelistPreview {
  valid: number
  issues: { line: number; message: string }[]
  issueCount: number
  totals: Record<ChainFamily, { count: number; amount: string }>
  roots: { evm: string | null; solana: string | null }
}

export interface AdminDashboard {
  canEdit: boolean
  campaign: CampaignOverview
  allocations: {
    total: number
    evm: number
    solana: number
    bySource: Record<'csv' | 'demo' | 'seed', number>
    latest: {
      family: ChainFamily
      address: string
      amount: string
      source: string
      addedAt: string
    }[]
  }
  publications: Publication[]
  actions: {
    kind: string
    chain: string
    method: string
    status: string
    count: number
    amount: string
  }[]
  recent: ActionView[]
  gates: GateSummary[]
  gateChecks: { gateId: string; checks: number; passed: number }[]
}
