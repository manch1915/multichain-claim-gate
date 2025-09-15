import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  verifySignature,
  type Address,
  type KeyPairSigner,
  type Rpc,
  type Signature,
  type SolanaRpcApi,
} from '@solana/kit'
import type { SolanaDeployment } from '../../config.js'
import { AppError } from '../../domain/errors.js'
import type {
  PreparedSolanaClaim,
  SolanaDistributorState,
  SolanaGateway,
} from '../../ports/chains.js'
import { TtlCache } from '../cache.js'
import {
  claimInstruction,
  claimStatusAddress,
  decodeClaimedAmount,
  decodeDistributor,
  updateRootInstruction,
  type DistributorAccounts,
} from './distributor-program.js'

export class KitSolanaGateway implements SolanaGateway {
  private readonly accounts: DistributorAccounts
  private readonly stateCache = new TtlCache<SolanaDistributorState>(4_000)

  constructor(
    private readonly rpc: Rpc<SolanaRpcApi>,
    private readonly signer: KeyPairSigner,
    deployment: SolanaDeployment,
  ) {
    this.accounts = {
      programId: address(deployment.programId),
      distributor: address(deployment.distributor),
      mint: address(deployment.mint),
      vault: address(deployment.vault),
    }
  }

  get feePayer(): string {
    return this.signer.address
  }

  distributorState(): Promise<SolanaDistributorState> {
    return this.stateCache.get('state', async () => {
      const data = await this.accountData(this.accounts.distributor)
      if (!data)
        throw new AppError('not_configured', 'The Solana distributor account does not exist')
      const decoded = decodeDistributor(data)
      return { root: decoded.root, version: decoded.version, paused: decoded.paused }
    })
  }

  async claimedAmount(claimant: string): Promise<bigint> {
    const pda = await claimStatusAddress(
      this.accounts.programId,
      this.accounts.distributor,
      address(claimant),
    )
    const data = await this.accountData(pda)
    return data ? decodeClaimedAmount(data) : 0n
  }

  async prepareClaim(
    claimant: string,
    amount: bigint,
    proof: Uint8Array[],
  ): Promise<PreparedSolanaClaim> {
    const instruction = await claimInstruction(
      this.accounts,
      this.signer.address,
      address(claimant),
      amount,
      proof,
    )
    const { value: blockhash } = await this.rpc
      .getLatestBlockhash({ commitment: 'confirmed' })
      .send()
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(this.signer.address, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
      (tx) => appendTransactionMessageInstruction(instruction, tx),
    )
    // Left unsigned on purpose: wallets such as Phantom ask for other signers to sign after them.
    const transaction = compileTransaction(message)
    return {
      transactionBase64: getBase64EncodedWireTransaction(transaction),
      messageBase64: Buffer.from(transaction.messageBytes).toString('base64'),
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    }
  }

  async submitClaim(
    signedTransactionBase64: string,
    expectedMessageBase64: string,
  ): Promise<string> {
    let transaction
    try {
      transaction = getTransactionDecoder().decode(
        getBase64Encoder().encode(signedTransactionBase64),
      )
    } catch {
      throw new AppError('bad_request', 'Could not decode the signed transaction')
    }

    const messageBytes = new Uint8Array(transaction.messageBytes)
    if (Buffer.from(messageBytes).toString('base64') !== expectedMessageBase64) {
      throw new AppError(
        'transaction_mismatch',
        'Your wallet changed the transaction before signing. Disable transaction edits and try again.',
      )
    }

    const claimantSigned = await this.hasValidUserSignature(transaction.signatures, messageBytes)
    if (!claimantSigned)
      throw new AppError('signature_invalid', 'The claim was not signed by your wallet')

    const signed = await partiallySignTransaction([this.signer.keyPair], transaction)
    try {
      return await this.rpc
        .sendTransaction(getBase64EncodedWireTransaction(signed), {
          encoding: 'base64',
          preflightCommitment: 'confirmed',
        })
        .send()
    } catch (error) {
      throw new AppError('chain_error', simulationMessage(error))
    }
  }

  async confirm(signature: string, timeoutMs = 60_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const { value } = await this.rpc.getSignatureStatuses([signature as Signature]).send()
      const status = value[0]
      if (status?.err) return false
      if (
        status?.confirmationStatus === 'confirmed' ||
        status?.confirmationStatus === 'finalized'
      ) {
        this.stateCache.delete('state')
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    return false
  }

  async updateRoot(root: Uint8Array): Promise<string> {
    const { value: blockhash } = await this.rpc
      .getLatestBlockhash({ commitment: 'confirmed' })
      .send()
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(this.signer.address, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
      (tx) =>
        appendTransactionMessageInstruction(
          updateRootInstruction(this.accounts, this.signer.address, root),
          tx,
        ),
    )
    const signed = await signTransaction([this.signer.keyPair], compileTransaction(message))
    return this.rpc
      .sendTransaction(getBase64EncodedWireTransaction(signed), {
        encoding: 'base64',
        preflightCommitment: 'confirmed',
      })
      .send()
  }

  private async hasValidUserSignature(
    signatures: Readonly<Record<Address, Uint8Array | null>>,
    messageBytes: Uint8Array,
  ): Promise<boolean> {
    for (const [signer, signature] of Object.entries(signatures) as [
      Address,
      Uint8Array | null,
    ][]) {
      if (signer === this.signer.address) continue
      if (!signature || signature.every((byte) => byte === 0)) return false
      const key = await getPublicKeyFromAddress(signer)
      if (
        !(await verifySignature(
          key,
          signature as Parameters<typeof verifySignature>[1],
          messageBytes,
        ))
      ) {
        return false
      }
    }
    return true
  }

  private async accountData(account: Address): Promise<Uint8Array | null> {
    const { value } = await this.rpc
      .getAccountInfo(account, { encoding: 'base64', commitment: 'confirmed' })
      .send()
    return value ? new Uint8Array(Buffer.from(value.data[0], 'base64')) : null
  }
}

function simulationMessage(error: unknown): string {
  const text =
    error instanceof Error ? `${error.message} ${JSON.stringify(error.cause ?? '')}` : String(error)
  if (text.includes('NothingToClaim')) return 'This wallet already claimed its allocation'
  if (text.includes('InvalidProof'))
    return 'The proof does not match the current root. Refresh and try again.'
  if (text.includes('Blockhash not found') || text.includes('BlockhashNotFound')) {
    return 'The transaction expired before it was sent. Try again.'
  }
  return 'Solana rejected the transaction. Try again in a moment.'
}
