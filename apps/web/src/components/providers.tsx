'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { isWalletReady, loadWallet, queryClient } from '@/lib/wallet'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => undefined,
})

export const useTheme = () => useContext(ThemeContext)

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

const readTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

function ThemeProvider({ children }: { children: ReactNode }) {
  // The inline script in the layout sets data-theme before paint; React just follows it.
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => 'light' as const)

  const toggle = useCallback(() => {
    const next = readTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      // private mode: the choice just will not persist
    }
    if (isWalletReady()) void loadWallet().then((wallet) => wallet.setTheme(next))
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}
