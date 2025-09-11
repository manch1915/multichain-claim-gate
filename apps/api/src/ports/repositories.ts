import type { ChainFamily } from '@mcg/core'
import type {
  ActionStatus,
  AllocationRecord,
  Campaign,
  Gate,
  LinkedAccount,
  RootPublication,
  Session,
  SponsoredAction,
  TreeSnapshot,
} from '../domain/models.js'

export interface NonceRecord {
  nonce: string
  accountId: string
  message: string
  expiresAt: Date
}

export interface AuthRepository {
  saveNonce(record: NonceRecord): Promise<void>
  /** Marks the nonce used and returns it, or undefined if it was missing, expired or already used. */
  consumeNonce(nonce: string, now: Date): Promise<NonceRecord | undefined>
  createSession(id: string, expiresAt: Date): Promise<void>
  findSession(id: string, now: Date): Promise<Session | undefined>
  upsertAccount(sessionId: string, account: LinkedAccount): Promise<void>
  removeAccount(sessionId: string, family: ChainFamily): Promise<void>
  deleteSession(id: string): Promise<void>
  purgeExpired(now: Date): Promise<void>
}

export interface CampaignRepository {
  findCampaign(id: string): Promise<Campaign | undefined>
  upsertCampaign(campaign: Campaign): Promise<void>
  listAllocations(campaignId: string, family?: ChainFamily): Promise<AllocationRecord[]>
  findAllocation(
    campaignId: string,
    family: ChainFamily,
    address: string,
  ): Promise<AllocationRecord | undefined>
  /** Inserts or raises allocations; amounts never go down so cumulative claims stay valid. */
  upsertAllocations(records: AllocationRecord[]): Promise<{ added: number; raised: number }>
  saveSnapshot(snapshot: TreeSnapshot): Promise<void>
  findSnapshot(
    campaignId: string,
    family: ChainFamily,
    root: string,
  ): Promise<TreeSnapshot | undefined>
  latestSnapshot(campaignId: string, family: ChainFamily): Promise<TreeSnapshot | undefined>
  savePublication(publication: RootPublication): Promise<void>
  listPublications(campaignId: string): Promise<RootPublication[]>
}

export interface ActionRepository {
  create(action: SponsoredAction): Promise<void>
  update(
    id: string,
    patch: Partial<Pick<SponsoredAction, 'status' | 'txHash' | 'userOpHash' | 'error'>>,
  ): Promise<void>
  find(id: string): Promise<SponsoredAction | undefined>
  findActive(
    kind: SponsoredAction['kind'],
    chain: string,
    address: string,
  ): Promise<SponsoredAction | undefined>
  listRecent(limit: number): Promise<SponsoredAction[]>
  stats(): Promise<
    {
      kind: string
      chain: string
      method: string
      status: ActionStatus
      count: number
      amount: bigint
    }[]
  >
}

export interface PreparedTransaction {
  id: string
  sessionId: string
  address: string
  campaignId: string
  amount: bigint
  messageBase64: string
  expiresAt: Date
}

export interface PreparedTransactionRepository {
  save(record: PreparedTransaction): Promise<void>
  take(id: string, sessionId: string, now: Date): Promise<PreparedTransaction | undefined>
}

export interface GateRepository {
  list(): Promise<Gate[]>
  find(id: string): Promise<Gate | undefined>
  upsert(gate: Gate): Promise<void>
  recordCheck(gateId: string, accounts: string[], passed: boolean): Promise<void>
  checkStats(): Promise<{ gateId: string; checks: number; passed: number }[]>
}
