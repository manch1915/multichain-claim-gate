import { createAppKit } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { QueryClient } from '@tanstack/react-query'
import { cookieStorage, createStorage } from 'wagmi'
import { networks } from './networks'
import { createSiwx } from './siwx'

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? ''
export const appKitConfigured = projectId.length > 0
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  // AppKit refuses to start without an id; the UI shows a setup notice in that case.
  projectId: projectId || 'missing-project-id',
  networks,
})

let initialised = false

/** Creates the modal once, on the client. */
export function initAppKit() {
  if (initialised || typeof window === 'undefined' || !appKitConfigured) return
  initialised = true
  createAppKit({
    adapters: [wagmiAdapter, new SolanaAdapter()],
    networks,
    projectId,
    siwx: createSiwx(queryClient),
    metadata: {
      name: 'Meridian Claim & Gate',
      description: 'Claim MRD on Sepolia, Base Sepolia and Solana devnet without paying gas.',
      url: siteUrl,
      icons: [`${siteUrl}/icon.svg`],
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
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#C3166F',
      '--w3m-font-family': 'var(--font-archivo), system-ui, sans-serif',
      '--w3m-border-radius-master': '2px',
    },
  })
}
