import { baseSepolia, sepolia, solanaDevnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [baseSepolia, sepolia, solanaDevnet]

export const evmNetworkByCaip2: Record<string, AppKitNetwork> = {
  'eip155:84532': baseSepolia,
  'eip155:11155111': sepolia,
}

export const DEMO_CAMPAIGN = 'meridian-genesis'

export const faucets = [
  {
    network: 'Base Sepolia',
    links: [
      { label: 'Coinbase faucet', href: 'https://portal.cdp.coinbase.com/products/faucet' },
      { label: 'Alchemy faucet', href: 'https://www.alchemy.com/faucets/base-sepolia' },
    ],
  },
  {
    network: 'Sepolia',
    links: [
      {
        label: 'Google Cloud faucet',
        href: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
      },
      { label: 'PoW faucet', href: 'https://sepolia-faucet.pk910.de' },
    ],
  },
  {
    network: 'Solana Devnet',
    links: [{ label: 'Solana faucet', href: 'https://faucet.solana.com' }],
  },
]
