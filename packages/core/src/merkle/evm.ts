import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getAddress, type Address, type Hex } from 'viem'

export interface Allocation {
  address: string
  /** Cumulative amount in base units. */
  amount: bigint
}

export interface EvmMerkleTree {
  root: Hex
  size: number
  proofFor(address: string): { amount: bigint; proof: Hex[] } | undefined
}

const LEAF_ENCODING = ['address', 'uint256']

/** Same leaf layout as MerkleDistributor.sol: keccak256(keccak256(abi.encode(account, amount))). */
export function buildEvmTree(allocations: readonly Allocation[]): EvmMerkleTree {
  if (allocations.length === 0) throw new Error('Cannot build a Merkle tree without allocations')

  const values: [Address, string][] = allocations.map((allocation) => [
    getAddress(allocation.address),
    allocation.amount.toString(),
  ])
  const tree = StandardMerkleTree.of(values, LEAF_ENCODING)
  const index = new Map<string, number>()
  for (const [i, [address]] of tree.entries()) {
    index.set(address.toLowerCase(), i)
  }

  return {
    root: tree.root as Hex,
    size: values.length,
    proofFor(address) {
      const i = index.get(address.toLowerCase())
      if (i === undefined) return undefined
      const [, amount] = tree.at(i) ?? []
      return { amount: BigInt(amount ?? 0), proof: tree.getProof(i) as Hex[] }
    },
  }
}
