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
