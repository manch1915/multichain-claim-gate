import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { generateKeyPairSigner } from '@solana/kit'
import { encodeAbiParameters, keccak256, concat, type Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildEvmTree, buildSolanaTree, solanaLeaf, verifySolanaProof } from '../src/index.js'

const evmAllocations = [
  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', amount: 100n * 10n ** 18n },
  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', amount: 250n * 10n ** 18n },
  { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', amount: 40n * 10n ** 18n },
]

function sortedKeccak(a: Hex, b: Hex): Hex {
  return keccak256(a.toLowerCase() < b.toLowerCase() ? concat([a, b]) : concat([b, a]))
}

describe('EVM Merkle tree', () => {
  const tree = buildEvmTree(evmAllocations)

  it('produces proofs that hash up to the root like MerkleDistributor.sol does', () => {
    for (const allocation of evmAllocations) {
      const result = tree.proofFor(allocation.address)
      expect(result?.amount).toBe(allocation.amount)

      const encoded = encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [allocation.address as Hex, allocation.amount],
      )
      let hash = keccak256(keccak256(encoded))
      for (const sibling of result?.proof ?? []) hash = sortedKeccak(hash, sibling)
      expect(hash).toBe(tree.root)
    }
  })

  it('matches the OpenZeppelin verifier', () => {
    const entry = evmAllocations[1]!
    const { proof } = tree.proofFor(entry.address)!
    const ok = StandardMerkleTree.verify(
      tree.root,
      ['address', 'uint256'],
      [entry.address, entry.amount.toString()],
      proof,
    )
    expect(ok).toBe(true)
  })

  it('looks addresses up case-insensitively', () => {
    expect(tree.proofFor(evmAllocations[0]!.address.toLowerCase())).toBeDefined()
    expect(tree.proofFor('0x0000000000000000000000000000000000000001')).toBeUndefined()
  })

  it('does not depend on input order', () => {
    expect(buildEvmTree([...evmAllocations].reverse()).root).toBe(tree.root)
  })

  it('refuses to build an empty tree', () => {
    expect(() => buildEvmTree([])).toThrow()
  })
})

describe('Solana Merkle tree', () => {
  async function allocations(count: number) {
    const signers = await Promise.all(Array.from({ length: count }, () => generateKeyPairSigner()))
    return signers.map((signer, i) => ({
      address: signer.address,
      amount: BigInt((i + 1) * 1_000_000),
    }))
  }

  it.each([1, 2, 3, 7, 16])('verifies every proof in a tree of %i leaves', async (count) => {
    const list = await allocations(count)
    const tree = buildSolanaTree(list)
    expect(tree.size).toBe(count)
    for (const allocation of list) {
      const result = tree.proofFor(allocation.address)!
      expect(verifySolanaProof(tree.root, allocation.address, result.amount, result.proof)).toBe(
        true,
      )
    }
  })

  it('rejects a wrong amount or a foreign proof', async () => {
    const list = await allocations(4)
    const tree = buildSolanaTree(list)
    const [first, second] = list as [(typeof list)[0], (typeof list)[0]]
    const proof = tree.proofFor(first.address)!.proof
    expect(verifySolanaProof(tree.root, first.address, first.amount + 1n, proof)).toBe(false)
    expect(verifySolanaProof(tree.root, second.address, second.amount, proof)).toBe(false)
  })

  it('uses the root of a single leaf as the leaf itself', async () => {
    const [only] = await allocations(1)
    const tree = buildSolanaTree([only!])
    expect(tree.root).toEqual(solanaLeaf(only!.address, only!.amount))
    expect(tree.proofFor(only!.address)!.proof).toHaveLength(0)
  })

  it('rejects amounts that do not fit in u64', async () => {
    const [only] = await allocations(1)
    expect(() => solanaLeaf(only!.address, 1n << 64n)).toThrow(/u64/)
  })
})
