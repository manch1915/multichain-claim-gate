'use client'

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
