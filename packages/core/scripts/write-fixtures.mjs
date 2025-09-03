// Writes Merkle fixtures that the Solidity and Rust test suites verify, so all three
// implementations are checked against the same proofs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKeyPairSignerFromPrivateKeyBytes } from '@solana/kit'
import { bytesToHex } from '@noble/hashes/utils.js'
import { buildEvmTree, buildSolanaTree } from '../dist/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function write(path, data) {
  const target = resolve(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(data, null, 2) + '\n')
  console.log(`wrote ${path}`)
}

const evmAllocations = [
  ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 1200n],
  ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 250n],
  ['0x90F79bf6EB2c4f870365E785982E1f101E93b906', 40n],
  ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', 999n],
  ['0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', 5n],
].map(([address, whole]) => ({ address, amount: whole * 10n ** 18n }))

const evmTree = buildEvmTree(evmAllocations)
write('contracts/evm/test/fixtures/merkle.json', {
  root: evmTree.root,
  claims: evmAllocations.map(({ address, amount }) => ({
    account: address,
    amount: amount.toString(),
    proof: evmTree.proofFor(address).proof,
  })),
})

const solanaAllocations = await Promise.all(
  [1, 2, 3, 4, 5, 6, 7].map(async (seed) => {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(seed))
    return { seed, address: signer.address, amount: BigInt(seed) * 1_500_000n }
  }),
)
const solanaTree = buildSolanaTree(solanaAllocations)
write('contracts/solana/programs/merkle-distributor/tests/fixtures/merkle.json', {
  root: solanaTree.rootHex,
  claims: solanaAllocations.map(({ seed, address, amount }) => ({
    seed,
    claimant: address,
    amount: Number(amount),
    proof: solanaTree.proofFor(address).proof.map((node) => bytesToHex(node)),
  })),
})
