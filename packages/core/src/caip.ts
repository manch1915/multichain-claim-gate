import { getAddress, isAddress } from 'viem'
import { isAddress as isSolanaAddress } from '@solana/kit'
import type { ChainFamily } from './chains.js'

const CAIP2 = /^(eip155:[1-9]\d{0,19}|solana:[1-9A-HJ-NP-Za-km-z]{32})$/

export interface AccountId {
  /** CAIP-2 chain id. */
  chain: string
  address: string
}

/** Parses a CAIP-10 account id such as `eip155:84532:0xabc…` or `solana:<genesis>:<pubkey>`. */
export function parseAccountId(value: string): AccountId {
  const parts = value.split(':')
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error(`Invalid CAIP-10 account id: ${value}`)
  }
  const [namespace, reference, address] = parts as [string, string, string]
  const chain = `${namespace}:${reference}`
  if (!CAIP2.test(chain)) throw new Error(`Invalid CAIP-2 chain id: ${chain}`)
  if (familyOfChain(chain) !== detectFamily(address)) {
    throw new Error(`Address ${address} does not belong to chain ${chain}`)
  }
  return { chain, address: normalizeAddress(address) }
}

export function formatAccountId(account: AccountId): string {
  return `${account.chain}:${account.address}`
}

export function familyOfChain(caip2: string): ChainFamily {
  if (caip2.startsWith('eip155:')) return 'evm'
  if (caip2.startsWith('solana:')) return 'solana'
  throw new Error(`Unsupported chain namespace: ${caip2}`)
}

export function detectFamily(address: string): ChainFamily | undefined {
  if (isAddress(address, { strict: false })) return 'evm'
  if (isSolanaAddress(address)) return 'solana'
  return undefined
}

/** EVM addresses become checksummed, Solana addresses are case-sensitive and kept as is. */
export function normalizeAddress(address: string): string {
  const family = detectFamily(address)
  if (family === 'evm') return getAddress(address)
  if (family === 'solana') return address
  throw new Error(`Not an EVM or Solana address: ${address}`)
}

export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 3) return address
  const head = address.startsWith('0x') ? size + 2 : size
  return `${address.slice(0, head)}…${address.slice(-size)}`
}
