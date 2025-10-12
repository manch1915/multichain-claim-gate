'use client'

import { useAppKitTheme } from '@reown/appkit/react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'
import { appKitConfigured, initAppKit, queryClient, wagmiAdapter } from '@/lib/appkit'

initAppKit()

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
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {appKitConfigured ? <AppKitThemeSync theme={theme} /> : null}
      {children}
    </ThemeContext.Provider>
  )
}

function AppKitThemeSync({ theme }: { theme: Theme }) {
  const { setThemeMode } = useAppKitTheme()
  useEffect(() => setThemeMode(theme), [theme, setThemeMode])
  return null
}

export function Providers({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies)
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
