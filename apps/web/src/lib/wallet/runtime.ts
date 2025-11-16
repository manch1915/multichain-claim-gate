// Everything that talks to wallets lives here and is loaded on demand. AppKit, wagmi, the
// connectors and @solana/web3.js add up to several hundred kilobytes; keeping them out of the
// first bundle lets pages render and respond before any wallet code runs.
import { createAppKit } from '@reown/appkit'
import { baseSepolia, sepolia, solanaDevnet, type AppKitNetwork } from '@reown/appkit/networks'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import type { Provider as SolanaProvider } from '@reown/appkit-adapter-solana'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { VersionedTransaction } from '@solana/web3.js'
import type { QueryClient } from '@tanstack/react-query'
import { getCapabilities, sendCalls, waitForCallsStatus } from 'wagmi/actions'
import { createSiwx } from '../siwx'

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [baseSepolia, sepolia, solanaDevnet]

export interface WalletRuntime {
  open(view?: 'Account'): Promise<void>
  setTheme(theme: 'light' | 'dark'): void
  supportsPaymaster(chainId: number): Promise<boolean>
  sendSponsoredCall(input: {
    chainId: number
    to: `0x${string}`
    data: `0x${string}`
    paymasterUrl: string
  }): Promise<void>
  signSolanaTransaction(base64: string): Promise<string>
}

export function createWalletRuntime(options: {
  projectId: string
  siteUrl: string
  queryClient: QueryClient
  theme: 'light' | 'dark'
}): WalletRuntime {
  const wagmiAdapter = new WagmiAdapter({ projectId: options.projectId, networks })
  const config = wagmiAdapter.wagmiConfig

  const modal = createAppKit({
    adapters: [wagmiAdapter, new SolanaAdapter()],
    networks,
    projectId: options.projectId,
    siwx: createSiwx(options.queryClient),
    metadata: {
      name: 'Meridian Claim & Gate',
      description: 'Claim MRD on Sepolia, Base Sepolia and Solana devnet without paying gas.',
      url: options.siteUrl,
      icons: [`${options.siteUrl}/icon.svg`],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      send: false,
      history: false,
    },
    themeMode: options.theme,
    themeVariables: {
      '--w3m-accent': '#C3166F',
      '--w3m-font-family': 'var(--font-archivo), system-ui, sans-serif',
      '--w3m-border-radius-master': '2px',
    },
  })

  return {
    async open(view) {
      await modal.open(view ? { view } : undefined)
    },

    setTheme(theme) {
      modal.setThemeMode(theme)
    },

    async supportsPaymaster(chainId) {
      try {
        const capabilities = await getCapabilities(config)
        const forChain = (
          capabilities as Record<number, { paymasterService?: { supported?: boolean } }>
        )[chainId]
        return Boolean(forChain?.paymasterService?.supported)
      } catch {
        return false
      }
    },

    async sendSponsoredCall({ chainId, to, data, paymasterUrl }) {
      const { id } = await sendCalls(config, {
        chainId,
        calls: [{ to, data }],
        capabilities: { paymasterService: { url: paymasterUrl } },
      })
      const status = await waitForCallsStatus(config, { id })
      if (status.status !== 'success') throw new Error('The wallet reported the claim as failed')
    },

    async signSolanaTransaction(base64) {
      const provider = modal.getProvider<SolanaProvider>('solana')
      if (!provider) throw new Error('Connect a Solana wallet first')
      const transaction = VersionedTransaction.deserialize(base64ToBytes(base64))
      const signed = await provider.signTransaction(transaction)
      return bytesToBase64(signed.serialize())
    },
  }
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
