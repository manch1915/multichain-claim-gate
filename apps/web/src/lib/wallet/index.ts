import { QueryClient } from '@tanstack/react-query'
import type { WalletRuntime } from './runtime'

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? ''
export const walletsEnabled = projectId.length > 0
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
})

let runtime: Promise<WalletRuntime> | undefined
let ready = false

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/**
 * Loads AppKit once, the first time someone reaches for a wallet. Pages never need it to render:
 * the session and every balance come from our API.
 */
export function loadWallet(): Promise<WalletRuntime> {
  if (!walletsEnabled) return Promise.reject(new Error('Wallet connections are not configured'))
  runtime ??= import('./runtime').then(({ createWalletRuntime }) => {
    const wallet = createWalletRuntime({ projectId, siteUrl, queryClient, theme: currentTheme() })
    ready = true
    void queryClient.invalidateQueries({ queryKey: ['paymaster-capability'] })
    return wallet
  })
  return runtime
}

export const isWalletReady = () => ready

/** Starts loading on hover or focus, so the modal is usually ready by the time of the click. */
export function warmWallet() {
  if (walletsEnabled) void loadWallet().catch(() => undefined)
}

export async function openWalletModal(view?: 'Account') {
  const wallet = await loadWallet()
  await wallet.open(view)
}
