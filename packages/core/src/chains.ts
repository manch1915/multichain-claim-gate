export type ChainFamily = 'evm' | 'solana'

export type ChainKey = 'sepolia' | 'baseSepolia' | 'solanaDevnet' | 'anvil'

export interface ChainInfo {
  key: ChainKey
  family: ChainFamily
  /** CAIP-2 id, e.g. `eip155:84532`. */
  caip2: string
  /** Numeric id for EVM chains, cluster name for Solana. */
  reference: string
  name: string
  shortName: string
  nativeSymbol: string
  nativeDecimals: number
  explorer: {
    name: string
    tx: (hash: string) => string
    address: (address: string) => string
  }
  testnet: true
}

export const chains: Record<ChainKey, ChainInfo> = {
  sepolia: {
    key: 'sepolia',
    family: 'evm',
    caip2: 'eip155:11155111',
    reference: '11155111',
    name: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorer: {
      name: 'Etherscan',
      tx: (hash) => `https://sepolia.etherscan.io/tx/${hash}`,
      address: (address) => `https://sepolia.etherscan.io/address/${address}`,
    },
    testnet: true,
  },
  baseSepolia: {
    key: 'baseSepolia',
    family: 'evm',
    caip2: 'eip155:84532',
    reference: '84532',
    name: 'Base Sepolia',
    shortName: 'Base Sepolia',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorer: {
      name: 'Basescan',
      tx: (hash) => `https://sepolia.basescan.org/tx/${hash}`,
      address: (address) => `https://sepolia.basescan.org/address/${address}`,
    },
    testnet: true,
  },
  solanaDevnet: {
    key: 'solanaDevnet',
    family: 'solana',
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    reference: 'devnet',
    name: 'Solana Devnet',
    shortName: 'Devnet',
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    explorer: {
      name: 'Solana Explorer',
      tx: (hash) => `https://explorer.solana.com/tx/${hash}?cluster=devnet`,
      address: (address) => `https://explorer.solana.com/address/${address}?cluster=devnet`,
    },
    testnet: true,
  },
  anvil: {
    key: 'anvil',
    family: 'evm',
    caip2: 'eip155:31337',
    reference: '31337',
    name: 'Anvil (local)',
    shortName: 'Anvil',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorer: {
      name: 'Local',
      tx: (hash) => `#tx-${hash}`,
      address: (address) => `#address-${address}`,
    },
    testnet: true,
  },
}

export const publicChainKeys = [
  'sepolia',
  'baseSepolia',
  'solanaDevnet',
] as const satisfies ChainKey[]

export function chainByCaip2(caip2: string): ChainInfo | undefined {
  return Object.values(chains).find((chain) => chain.caip2 === caip2)
}

export function evmChainById(chainId: number): ChainInfo | undefined {
  return chainByCaip2(`eip155:${chainId}`)
}
