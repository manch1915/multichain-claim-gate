'use client'

import { useAppKitAccount } from '@reown/appkit/react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SessionView } from '@/lib/types'

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => (await api.get<{ session: SessionView | null }>('/auth/session')).session,
    staleTime: 30_000,
  })
}

/** Wallets connected in AppKit, per namespace. Signing in is tracked separately by useSession. */
export function useWallets() {
  const evm = useAppKitAccount({ namespace: 'eip155' })
  const solana = useAppKitAccount({ namespace: 'solana' })
  return {
    evm: evm.isConnected ? evm.address : undefined,
    solana: solana.isConnected ? solana.address : undefined,
    anyConnected: evm.isConnected || solana.isConnected,
  }
}
