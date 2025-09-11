export interface EvmCall {
  to: `0x${string}`
  data: `0x${string}`
  value?: bigint
}

export interface SponsorReceipt {
  success: boolean
  txHash: string
}

export interface SponsorSubmission {
  method: 'sponsored-userop' | 'sponsor-tx'
  /** User operation hash for 4337 submissions, transaction hash otherwise. */
  hash: string
  wait(): Promise<SponsorReceipt>
}

/** Sends calls on behalf of the backend account without the user paying gas. */
export interface EvmSponsor {
  readonly address: `0x${string}`
  readonly method: SponsorSubmission['method']
  submit(chain: string, calls: EvmCall[]): Promise<SponsorSubmission>
}

export interface EvmDistributorState {
  root: `0x${string}`
  paused: boolean
}

export interface EvmGateway {
  supportedChains(): string[]
  setRootCall(chain: string, root: string): EvmCall
  claimCall(chain: string, account: string, amount: bigint, proof: `0x${string}`[]): EvmCall
  mintPassCall(chain: string, to: string): EvmCall
  /** Chain where the access pass lives, if any. */
  passChain(): string | undefined
  distributorState(chain: string): Promise<EvmDistributorState>
  claimedAmount(chain: string, account: string): Promise<bigint>
  /** Throws a readable error if the claim would revert. */
  simulateClaim(
    chain: string,
    account: string,
    amount: bigint,
    proof: `0x${string}`[],
  ): Promise<void>
  hasPass(chain: string, account: string): Promise<boolean>
}

export interface SolanaDistributorState {
  root: string
  version: bigint
  paused: boolean
}

export interface PreparedSolanaClaim {
  /** Base64 wire transaction with an empty slot for the claimant's signature. */
  transactionBase64: string
  messageBase64: string
  lastValidBlockHeight: bigint
}

export interface SolanaGateway {
  readonly feePayer: string
  distributorState(): Promise<SolanaDistributorState>
  claimedAmount(claimant: string): Promise<bigint>
  prepareClaim(claimant: string, amount: bigint, proof: Uint8Array[]): Promise<PreparedSolanaClaim>
  /** Checks the claimant signature, adds the fee payer signature and sends. Returns the signature. */
  submitClaim(signedTransactionBase64: string, expectedMessageBase64: string): Promise<string>
  confirm(signature: string): Promise<boolean>
  updateRoot(root: Uint8Array): Promise<string>
}

/** Read-only balances for any configured chain, independent of our deployments. */
export interface BalanceReader {
  native(chain: string, address: string): Promise<bigint>
  erc20(chain: string, token: string, address: string): Promise<bigint>
  erc721(chain: string, collection: string, address: string): Promise<bigint>
  spl(chain: string, mint: string, owner: string): Promise<bigint>
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

export interface HistoryProvider {
  history(chain: string, address: string, limit: number): Promise<TxHistoryItem[]>
}

export interface PriceProvider {
  /** Mainnet reference prices in USD, keyed by symbol. */
  prices(): Promise<Record<string, number>>
}

export interface TelegramInviter {
  readonly enabled: boolean
  createInvite(label: string): Promise<{ url: string; expiresAt: Date }>
}
