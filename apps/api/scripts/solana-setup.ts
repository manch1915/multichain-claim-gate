// Creates the MRD mint on devnet, initialises the distributor and funds its vault.
// Run once after `solana program deploy`:
//   npx tsx --env-file=../../.env scripts/solana-setup.ts <programId>
import { readFileSync, writeFileSync } from 'node:fs'
import { getCreateAccountInstruction } from '@solana-program/system'
import {
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit'
import {
  associatedTokenAddress,
  distributorAddress,
  initializeInstruction,
} from '../src/infra/solana/distributor-program.js'
import { parseSolanaSecret } from '../src/infra/solana/keys.js'

const DECIMALS = 6
const POOL = 10_000_000n * 10n ** BigInt(DECIMALS)

const programId = address(process.argv[2] ?? '')
const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const deploymentsFile = process.env.DEPLOYMENTS_FILE ?? '../../deployments/testnet.json'
const secret = process.env.SOLANA_FEE_PAYER_SECRET
if (!secret) throw new Error('SOLANA_FEE_PAYER_SECRET is not set')

const rpc = createSolanaRpc(rpcUrl)
// Public clusters serve websockets on the RPC host; a local validator uses the next port up.
const wsUrl = process.env.SOLANA_WS_URL ?? rpcUrl.replace(/^http/, 'ws')
const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl)
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

async function send(payer: KeyPairSigner, instructions: Instruction[]) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send()
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  )
  const signed = await signTransactionMessageWithSigners(message)
  await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: 'confirmed' })
  return getSignatureFromTransaction(signed)
}

const authority = await createKeyPairSignerFromBytes(parseSolanaSecret(secret))
const mint = await generateKeyPairSigner()
const rent = await rpc.getMinimumBalanceForRentExemption(BigInt(getMintSize())).send()

console.log(`authority ${authority.address}`)
console.log(`creating mint ${mint.address}`)
await send(authority, [
  getCreateAccountInstruction({
    payer: authority,
    newAccount: mint,
    lamports: rent,
    space: getMintSize(),
    programAddress: TOKEN_PROGRAM_ADDRESS,
  }),
  getInitializeMint2Instruction({
    mint: mint.address,
    decimals: DECIMALS,
    mintAuthority: authority.address,
  }),
])

const distributor = await distributorAddress(programId, mint.address, authority.address)
const vault = await associatedTokenAddress(distributor, mint.address)
const accounts = { programId, distributor, mint: mint.address, vault }

console.log(`initialising distributor ${distributor}`)
const signature = await send(authority, [
  initializeInstruction(accounts, authority.address, new Uint8Array(32)),
  getMintToCheckedInstruction({
    mint: mint.address,
    token: vault,
    mintAuthority: authority,
    amount: POOL,
    decimals: DECIMALS,
  }),
])
console.log(`done: ${signature}`)

let deployments: Record<string, unknown> = { evm: {} }
try {
  deployments = JSON.parse(readFileSync(deploymentsFile, 'utf8')) as Record<string, unknown>
} catch {
  // first deployment
}
deployments.solana = {
  programId,
  mint: mint.address,
  distributor,
  vault,
  authority: authority.address,
  decimals: DECIMALS,
}
writeFileSync(deploymentsFile, `${JSON.stringify(deployments, null, 2)}\n`)
console.log(`wrote ${deploymentsFile}`)
