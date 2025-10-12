'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { GateCheck, Portfolio } from '@/lib/types'
import { useEligibility } from './use-campaign'
import { useSession } from './use-session'

export type WaypointState = 'done' | 'current' | 'ahead'

export interface RouteProgress {
  loading: boolean
  funded: boolean
  signedIn: boolean
  claimed: boolean
  inLounge: boolean
  /** Index of the first unfinished waypoint, 0–3, or 4 when the route is complete. */
  current: number
}

export function useRouteProgress(): RouteProgress {
  const session = useSession()
  const signedIn = Boolean(session.data?.accounts.length)
  const eligibility = useEligibility()
  const portfolio = useQuery({
    queryKey: ['portfolio'],
    enabled: signedIn,
    queryFn: () => api.get<Portfolio>('/portfolio'),
  })
  const lounge = useQuery({
    queryKey: ['gate', 'holders-lounge', session.data?.accounts.map((a) => a.address).join(',')],
    enabled: signedIn,
    queryFn: () => api.get<GateCheck>('/gates/holders-lounge'),
  })

  const funded = Boolean(
    portfolio.data?.chains.some((chain) =>
      chain.assets.some((asset) => asset.kind === 'native' && BigInt(asset.balance) > 0n),
    ),
  )
  const claimed = Boolean(
    eligibility.data?.some((chain) => chain.status === 'claimed' || BigInt(chain.claimed) > 0n),
  )
  const inLounge = Boolean(lounge.data?.passed)

  // Test funds are optional (claims are gasless), so they never block the next waypoint.
  const steps = [funded || signedIn, signedIn, claimed, inLounge]
  const current = steps.findIndex((done) => !done)

  return {
    loading: session.isLoading,
    funded,
    signedIn,
    claimed,
    inLounge,
    current: current === -1 ? 4 : current,
  }
}

export function waypointState(index: number, current: number): WaypointState {
  if (index < current) return 'done'
  return index === current ? 'current' : 'ahead'
}
