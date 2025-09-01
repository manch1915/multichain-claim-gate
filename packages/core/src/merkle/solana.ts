import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js'
import { address as toAddress, getAddressEncoder } from '@solana/kit'
import type { Allocation } from './evm.js'

/**
 * Merkle tree for the Solana distributor program.
 *
 * leaf = sha256(0x00 || claimant (32 bytes) || amount (u64 little endian))
 * node = sha256(0x01 || min(a, b) || max(a, b))
 *
 * The prefixes keep a leaf from ever being reinterpreted as an inner node. Pairs are sorted, so a
 * proof is just the list of siblings with no left/right flags. Odd nodes move up unchanged.
 */
export interface SolanaMerkleTree {
  root: Uint8Array
  rootHex: string
  size: number
  proofFor(address: string): { amount: bigint; proof: Uint8Array[] } | undefined
}

const LEAF_PREFIX = Uint8Array.of(0)
const NODE_PREFIX = Uint8Array.of(1)
const U64_MAX = (1n << 64n) - 1n
const addressEncoder = getAddressEncoder()

export function solanaLeaf(claimant: string, amount: bigint): Uint8Array {
  if (amount < 0n || amount > U64_MAX) throw new Error(`Amount does not fit into u64: ${amount}`)
  const amountBytes = new Uint8Array(8)
  new DataView(amountBytes.buffer).setBigUint64(0, amount, true)
  const claimantBytes = new Uint8Array(addressEncoder.encode(toAddress(claimant)))
  return sha256(concatBytes(LEAF_PREFIX, claimantBytes, amountBytes))
}

export function solanaNode(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [first, second] = compareBytes(a, b) <= 0 ? [a, b] : [b, a]
  return sha256(concatBytes(NODE_PREFIX, first, second))
}

export function verifySolanaProof(
  root: Uint8Array,
  claimant: string,
  amount: bigint,
  proof: readonly Uint8Array[],
): boolean {
  let hash = solanaLeaf(claimant, amount)
  for (const sibling of proof) hash = solanaNode(hash, sibling)
  return compareBytes(hash, root) === 0
}

export function buildSolanaTree(allocations: readonly Allocation[]): SolanaMerkleTree {
  if (allocations.length === 0) throw new Error('Cannot build a Merkle tree without allocations')

  const leaves = allocations
    .map((allocation) => ({
      address: allocation.address,
      amount: allocation.amount,
      hash: solanaLeaf(allocation.address, allocation.amount),
    }))
    .sort((a, b) => compareBytes(a.hash, b.hash))

  const layers: Uint8Array[][] = [leaves.map((leaf) => leaf.hash)]
  while ((layers.at(-1) ?? []).length > 1) {
    const level = layers.at(-1) ?? []
    const next: Uint8Array[] = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Uint8Array
      const right = level[i + 1]
      next.push(right ? solanaNode(left, right) : left)
    }
    layers.push(next)
  }

  const root = (layers.at(-1) ?? [])[0] as Uint8Array
  const index = new Map(leaves.map((leaf, i) => [leaf.address, i]))

  return {
    root,
    rootHex: bytesToHex(root),
    size: leaves.length,
    proofFor(address) {
      let i = index.get(address)
      if (i === undefined) return undefined
      const amount = (leaves[i] as { amount: bigint }).amount
      const proof: Uint8Array[] = []
      for (const level of layers.slice(0, -1)) {
        const sibling = level[i ^ 1]
        if (sibling) proof.push(sibling)
        i = Math.floor(i / 2)
      }
      return { amount, proof }
    },
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const diff = (a[i] as number) - (b[i] as number)
    if (diff !== 0) return diff
  }
  return a.length - b.length
}
