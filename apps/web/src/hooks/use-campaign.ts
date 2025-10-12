'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DEMO_CAMPAIGN } from '@/lib/networks'
import type { CampaignOverview, ChainEligibility } from '@/lib/types'
import { useSession } from './use-session'

export function useCampaign() {
  return useQuery({
    queryKey: ['campaign', DEMO_CAMPAIGN],
    queryFn: () => api.get<CampaignOverview>(`/campaigns/${DEMO_CAMPAIGN}`),
  })
}

export function useEligibility() {
  const session = useSession()
  const signedIn = Boolean(session.data?.accounts.length)
  return useQuery({
    queryKey: [
      'eligibility',
      DEMO_CAMPAIGN,
      session.data?.accounts.map((a) => a.address).join(','),
    ],
    enabled: signedIn,
    queryFn: async () =>
      (await api.get<{ chains: ChainEligibility[] }>(`/campaigns/${DEMO_CAMPAIGN}/eligibility`))
        .chains,
    // While a new root is being published the status flips within seconds, so poll briefly.
    refetchInterval: (query) =>
      query.state.data?.some((chain) => chain.status === 'pending_publication') ? 4000 : false,
  })
}
