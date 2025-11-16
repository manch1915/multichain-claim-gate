'use client'

import { chainByCaip2, chains } from '@mcg/core/chains'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ListPlus } from 'lucide-react'
import { useCampaign, useEligibility } from '@/hooks/use-campaign'
import { useSession } from '@/hooks/use-session'
import type { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import { DEMO_CAMPAIGN } from '@/lib/networks'
import { SignInPrompt } from '../sign-in-prompt'
import { Button, InlineError, Panel, Skeleton } from '../ui'
import { ChainClaimCard } from './chain-claim-card'

export function ClaimBoard() {
  const session = useSession()
  const campaign = useCampaign()
  const eligibility = useEligibility()
  const queryClient = useQueryClient()

  const join = useMutation({
    mutationFn: () => api.post<{ added: number }>(`/campaigns/${DEMO_CAMPAIGN}/demo-join`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eligibility'] }),
  })

  if (session.isLoading) return <BoardSkeleton />
  if (!session.data?.accounts.length) {
    return (
      <SignInPrompt
        title="Sign in to see your allocation"
        body="Connect an EVM or a Solana wallet. Your allocation and claim status are tied to the address you sign in with."
      />
    )
  }

  const rows = eligibility.data ?? []
  const notListed = rows.some((row) => row.status === 'not_listed')
  const families = new Set(session.data.accounts.map((account) => account.family))
  const demoAmount = campaign.data?.campaign.demoAmount ?? '250'

  return (
    <div className="grid gap-6">
      {notListed ? (
        <Panel className="flex flex-col gap-4 border-magenta/40 bg-magenta-soft/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="type-heading text-lg">Your wallet is not on the list yet</h2>
            <p className="mt-1 max-w-prose text-ink-soft">
              The demo whitelist is open. Add your signed-in wallets and each gets {demoAmount} MRD
              on every network it can use.
            </p>
            {join.error ? (
              <div className="mt-3">
                <InlineError>{(join.error as ApiError).message}</InlineError>
              </div>
            ) : null}
          </div>
          <Button
            icon={<ListPlus className="size-4" aria-hidden />}
            loading={join.isPending}
            onClick={() => join.mutate()}
          >
            Add me to the demo list
          </Button>
        </Panel>
      ) : null}

      {eligibility.isLoading ? <BoardSkeleton /> : null}
      {eligibility.error ? (
        <InlineError>{(eligibility.error as ApiError).message}</InlineError>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {rows.map((row) => (
          <ChainClaimCard key={row.chain} eligibility={row} />
        ))}
        {!families.has('solana') ? (
          <MissingFamilyCard chain={chains.solanaDevnet.caip2} family="Solana" />
        ) : null}
        {!families.has('evm') ? (
          <>
            <MissingFamilyCard chain={chains.baseSepolia.caip2} family="EVM" />
            <MissingFamilyCard chain={chains.sepolia.caip2} family="EVM" />
          </>
        ) : null}
      </div>
    </div>
  )
}

function MissingFamilyCard({ chain, family }: { chain: string; family: string }) {
  return (
    <Panel className="flex flex-col justify-between gap-4 border-dashed bg-transparent p-5">
      <div>
        <p className="type-heading text-[1.02rem]">{chainByCaip2(chain)?.name}</p>
        <p className="mt-2 text-sm text-ink-soft">
          Link a {family} wallet to the same session to claim here as well.
        </p>
      </div>
    </Panel>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Panel key={i} className="grid gap-4 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-11 w-full" />
        </Panel>
      ))}
    </div>
  )
}
