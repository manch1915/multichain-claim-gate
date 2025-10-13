'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import type { ActionView } from '@/lib/types'

/** Polls a sponsored action until it settles, then refreshes balances and eligibility. */
export function useActionStatus(id: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['action', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<{ action: ActionView }>(`/claims/${id}`)).action,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 2500 : false),
  })

  const settled = query.data && query.data.status !== 'pending'
  useEffect(() => {
    if (!settled) return
    void queryClient.invalidateQueries({ queryKey: ['eligibility'] })
    void queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    void queryClient.invalidateQueries({ queryKey: ['gate'] })
  }, [settled, queryClient])

  return query
}
