'use client'

import { chainByCaip2 } from '@mcg/core/chains'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useActionStatus } from '@/hooks/use-action'
import { useSolanaClaim, useSponsoredClaim, useWalletPaymasterClaim } from '@/hooks/use-claim'
import { api, ApiError } from '@/lib/api'
import { formatAmount, shortHash } from '@/lib/format'
import { DEMO_CAMPAIGN } from '@/lib/networks'
import type { ActionView, ChainEligibility, EligibilityStatus } from '@/lib/types'
import { Badge, Button, ChainMark, InlineError, Panel } from '../ui'

const statusBadge: Record<
  EligibilityStatus,
  { tone: 'neutral' | 'go' | 'wait' | 'stop' | 'accent'; label: string }
> = {
  not_listed: { tone: 'neutral', label: 'Not on the list' },
  pending_publication: { tone: 'wait', label: 'Publishing root' },
  claimable: { tone: 'accent', label: 'Ready to claim' },
  claimed: { tone: 'go', label: 'Claimed' },
  paused: { tone: 'stop', label: 'Paused' },
  unavailable: { tone: 'stop', label: 'Network unavailable' },
}

export function ChainClaimCard({ eligibility }: { eligibility: ChainEligibility }) {
  const info = chainByCaip2(eligibility.chain)
  const badge = statusBadge[eligibility.status]
  const isSolana = eligibility.family === 'solana'
  const [actionId, setActionId] = useState<string>()
  const action = useActionStatus(actionId)

  const shown =
    eligibility.status === 'claimable'
      ? eligibility.claimable
      : eligibility.status === 'claimed'
        ? eligibility.claimed
        : eligibility.allocated

  return (
    <Panel
      as="article"
      className="flex flex-col p-5"
      aria-labelledby={`claim-${eligibility.chain}`}
    >
      <header className="flex items-center justify-between gap-3">
        <h3
          id={`claim-${eligibility.chain}`}
          className="type-heading flex items-center gap-2 text-[1.02rem]"
        >
          <ChainMark chain={eligibility.chain} />
          {info?.name ?? eligibility.chain}
        </h3>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </header>

      <p className="nums mt-5 flex items-baseline gap-2">
        <span className="type-chart text-[2.1rem]">
          {formatAmount(shown, eligibility.decimals)}
        </span>
        <span className="text-ink-soft">MRD</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {eligibility.status === 'claimed'
          ? 'Already in your wallet'
          : eligibility.status === 'claimable'
            ? 'Free to claim, gas is covered'
            : eligibility.status === 'not_listed'
              ? 'Join the demo list to get an allocation'
              : eligibility.status === 'pending_publication'
                ? 'Waiting for the new Merkle root on this network'
                : (eligibility.error ?? 'Claims are paused right now')}
      </p>

      <div className="mt-5 grid gap-3" aria-live="polite">
        {eligibility.status === 'claimable' && !actionId ? (
          isSolana ? (
            <SolanaClaimButton
              amount={shown}
              decimals={eligibility.decimals}
              onAction={setActionId}
            />
          ) : (
            <EvmClaimButtons
              chain={eligibility.chain}
              amount={shown}
              decimals={eligibility.decimals}
              onAction={setActionId}
            />
          )
        ) : null}
        {eligibility.status === 'pending_publication' ? <PublishingNote /> : null}
        <AnimatePresence>
          {action.data ? <ActionTracker action={action.data} /> : null}
        </AnimatePresence>
      </div>

      {eligibility.status === 'claimable' || eligibility.status === 'claimed' ? (
        <ProofDetails chain={eligibility.chain} enabled={eligibility.status === 'claimable'} />
      ) : null}
    </Panel>
  )
}

function EvmClaimButtons({
  chain,
  amount,
  decimals,
  onAction,
}: {
  chain: string
  amount: string
  decimals: number
  onAction: (id: string) => void
}) {
  const sponsored = useSponsoredClaim(chain)
  const wallet = useWalletPaymasterClaim(chain)
  const error = sponsored.error ?? wallet.mutation.error

  return (
    <>
      <Button
        loading={sponsored.isPending}
        onClick={() => sponsored.mutate(undefined, { onSuccess: (action) => onAction(action.id) })}
      >
        Claim {formatAmount(amount, decimals)} MRD
      </Button>
      {wallet.supported ? (
        <Button
          variant="secondary"
          icon={<Wallet className="size-4" aria-hidden />}
          loading={wallet.mutation.isPending}
          onClick={() => wallet.mutation.mutate()}
        >
          Send from my smart wallet
        </Button>
      ) : null}
      {wallet.mutation.isSuccess ? (
        <p className="text-sm text-go">Sent from your wallet. The paymaster covered the gas.</p>
      ) : null}
      {error ? <InlineError>{errorText(error)}</InlineError> : null}
    </>
  )
}

function SolanaClaimButton({
  amount,
  decimals,
  onAction,
}: {
  amount: string
  decimals: number
  onAction: (id: string) => void
}) {
  const claim = useSolanaClaim()
  return (
    <>
      <Button
        loading={claim.isPending}
        onClick={() => claim.mutate(undefined, { onSuccess: (action) => onAction(action.id) })}
      >
        Sign and claim {formatAmount(amount, decimals)} MRD
      </Button>
      <p className="text-sm text-muted">Your wallet signs, the backend pays the fee and rent.</p>
      {claim.error ? <InlineError>{errorText(claim.error)}</InlineError> : null}
    </>
  )
}

function PublishingNote() {
  return (
    <p className="flex items-center gap-2 rounded-control bg-wait-soft px-3 py-2 text-sm text-wait">
      <span className="size-2 animate-pulse rounded-full bg-wait" aria-hidden />
      The backend is updating the root on-chain. This usually takes under a minute.
    </p>
  )
}

function ActionTracker({ action }: { action: ActionView }) {
  const info = chainByCaip2(action.chain)
  const method =
    action.method === 'sponsored-userop'
      ? 'User operation via Pimlico paymaster'
      : action.method === 'solana-fee-payer'
        ? 'Backend fee payer'
        : 'Sponsor transaction'
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-control border border-line bg-paper p-3 text-sm"
    >
      <p className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {action.status === 'pending'
            ? 'Waiting for confirmation'
            : action.status === 'confirmed'
              ? 'Confirmed on-chain'
              : 'The claim failed'}
        </span>
        <Badge
          tone={action.status === 'confirmed' ? 'go' : action.status === 'failed' ? 'stop' : 'wait'}
        >
          {action.status}
        </Badge>
      </p>
      <p className="mt-1 text-muted">{method}</p>
      {action.txHash && info ? (
        <a
          href={info.explorer.tx(action.txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[0.82rem] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-magenta"
        >
          {shortHash(action.txHash)} on {info.explorer.name}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : action.userOpHash ? (
        <p className="mt-2 font-mono text-[0.82rem] text-muted">
          userOp {shortHash(action.userOpHash)}
        </p>
      ) : null}
      {action.error ? <p className="mt-2 text-stop">{action.error}</p> : null}
    </motion.div>
  )
}

function ProofDetails({ chain, enabled }: { chain: string; enabled: boolean }) {
  const [open, setOpen] = useState(false)
  const proof = useQuery({
    queryKey: ['proof', chain],
    enabled: open && enabled,
    queryFn: async () =>
      (
        await api.get<{ proof: { amount: string; proof: string[]; root: string } | null }>(
          `/campaigns/${DEMO_CAMPAIGN}/proof?chain=${encodeURIComponent(chain)}`,
        )
      ).proof,
  })

  return (
    <div className="mt-5 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-chip py-1 text-sm text-ink-soft hover:text-ink"
      >
        Merkle proof
        <ChevronDown
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="mt-2 text-[0.82rem]">
          {!enabled ? (
            <p className="text-muted">The proof is no longer needed once the claim is done.</p>
          ) : proof.isLoading ? (
            <p className="text-muted">Loading the proof…</p>
          ) : proof.data ? (
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-1 font-mono">
              {proof.data.proof.map((node, i) => (
                <li key={node} className="flex min-w-0 gap-2 text-ink-soft">
                  <span className="w-5 shrink-0 text-right text-muted">{i + 1}</span>
                  <span className="min-w-0 truncate" title={node}>
                    {node}
                  </span>
                </li>
              ))}
              <li className="mt-1 flex min-w-0 gap-2 text-ink">
                <span className="w-5 shrink-0 text-right text-magenta">R</span>
                <span className="min-w-0 truncate" title={proof.data.root}>
                  {proof.data.root}
                </span>
              </li>
            </ol>
          ) : (
            <p className="text-muted">No proof for this wallet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message
  const message = error instanceof Error ? error.message : String(error)
  if (/reject|denied|cancel/i.test(message)) return 'You cancelled the request in your wallet.'
  return message.split('\n')[0] ?? 'Something went wrong'
}
