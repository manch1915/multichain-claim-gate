'use client'

import { chainByCaip2 } from '@mcg/core/chains'
import { shortAddress } from '@mcg/core/format'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import type { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import { formatAmount, relativeTime, shortHash } from '@/lib/format'
import type { AdminDashboard, Publication } from '@/lib/types'
import { Badge, ChainMark, InlineError, Panel, Skeleton } from '../ui'
import { GateEditor } from './gate-editor'
import { WhitelistUpload } from './whitelist-upload'

const methodLabels: Record<string, string> = {
  'sponsored-userop': 'User operation, paymaster',
  'sponsor-tx': 'Sponsor transaction',
  'wallet-paymaster': 'Wallet with paymaster',
  'solana-fee-payer': 'Solana fee payer',
}

export function AdminView() {
  const dashboard = useQuery({
    queryKey: ['admin'],
    queryFn: () => api.get<AdminDashboard>('/admin/dashboard'),
    refetchInterval: 15_000,
  })

  if (dashboard.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Panel key={i} className="grid gap-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </Panel>
        ))}
      </div>
    )
  }
  if (dashboard.error) return <InlineError>{(dashboard.error as ApiError).message}</InlineError>
  if (!dashboard.data) return null
  const data = dashboard.data

  const confirmed = data.actions.filter(
    (row) => row.kind === 'airdrop' && row.status === 'confirmed',
  )
  const claimCount = confirmed.reduce((sum, row) => sum + row.count, 0)

  return (
    <div className="grid gap-8">
      <p className="text-sm">
        {data.canEdit ? (
          <Badge tone="accent">Signed in as admin</Badge>
        ) : (
          <span className="text-muted">
            Read-only view. Uploads and rule changes need an admin wallet; previews work for
            everyone.
          </span>
        )}
      </p>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label="Whitelisted wallets" value={data.allocations.total.toLocaleString('en-US')}>
          {data.allocations.evm} EVM, {data.allocations.solana} Solana
        </Stat>
        <Stat label="Confirmed claims" value={claimCount.toLocaleString('en-US')}>
          {confirmed.length
            ? confirmed
                .map((row) => `${row.count} via ${methodLabels[row.method] ?? row.method}`)
                .join(', ')
            : 'None yet'}
        </Stat>
        <Stat
          label="Joined from the demo"
          value={data.allocations.bySource.demo.toLocaleString('en-US')}
        >
          {data.allocations.bySource.seed} seeded, {data.allocations.bySource.csv} from CSV
        </Stat>
      </dl>

      <Panel className="overflow-hidden">
        <h2 className="type-heading border-b border-line px-5 py-4 text-lg">
          Merkle roots on-chain
        </h2>
        <PublicationTable publications={data.publications} />
      </Panel>

      <WhitelistUpload canEdit={data.canEdit} />

      <section aria-labelledby="gates-title" className="grid gap-4">
        <h2 id="gates-title" className="type-heading text-lg">
          Access rules
        </h2>
        {data.gates.map((gate) => (
          <GateEditor
            key={gate.id}
            gate={gate}
            canEdit={data.canEdit}
            stats={data.gateChecks.find((row) => row.gateId === gate.id)}
          />
        ))}
      </section>

      <Panel className="overflow-hidden">
        <h2 className="type-heading border-b border-line px-5 py-4 text-lg">
          Latest sponsored actions
        </h2>
        {data.recent.length === 0 ? (
          <p className="px-5 py-6 text-ink-soft">No claims or pass mints yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 font-medium">Wallet</th>
                  <th className="px-3 py-2.5 font-medium">Network</th>
                  <th className="px-3 py-2.5 font-medium">What</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((action) => (
                  <tr key={action.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-mono text-[0.82rem]">
                      {shortAddress(action.address)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <ChainMark chain={action.chain} className="size-3.5" />
                        {chainByCaip2(action.chain)?.shortName ?? action.chain}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {action.kind === 'pass'
                        ? 'Pass mint'
                        : `${formatAmount(action.amount ?? '0', action.chain.startsWith('solana:') ? 6 : 18)} MRD`}
                      <span className="block text-xs text-muted">
                        {methodLabels[action.method]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={
                          action.status === 'confirmed'
                            ? 'go'
                            : action.status === 'failed'
                              ? 'stop'
                              : 'wait'
                        }
                      >
                        {action.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right text-muted">
                      {relativeTime(action.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Stat({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: React.ReactNode
}) {
  return (
    <Panel as="div" className="p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="nums type-chart mt-1 text-[1.9rem]">{value}</dd>
      <dd className="mt-1 text-sm text-ink-soft">{children}</dd>
    </Panel>
  )
}

function PublicationTable({ publications }: { publications: Publication[] }) {
  if (publications.length === 0) {
    return (
      <p className="px-5 py-6 text-ink-soft">
        No roots published yet. The first one goes out after the first change to the list.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="px-5 py-2.5 font-medium">Network</th>
            <th className="px-3 py-2.5 font-medium">Root</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {publications.map((publication) => {
            const info = chainByCaip2(publication.chain)
            return (
              <tr key={publication.chain} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <ChainMark chain={publication.chain} className="size-3.5" />
                    {info?.name ?? publication.chain}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[0.82rem]" title={publication.root}>
                  {shortHash(
                    publication.root.startsWith('0x') ? publication.root : `0x${publication.root}`,
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <Badge
                      tone={
                        publication.status === 'confirmed'
                          ? 'go'
                          : publication.status === 'failed'
                            ? 'stop'
                            : 'wait'
                      }
                    >
                      {publication.status}
                    </Badge>
                    {publication.txHash && info ? (
                      <a
                        href={info.explorer.tx(publication.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-soft hover:text-ink"
                        aria-label="Open the root update in the explorer"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </span>
                  {publication.error ? (
                    <span className="mt-1 block text-xs text-stop">{publication.error}</span>
                  ) : null}
                </td>
                <td className="px-5 py-2.5 text-right text-muted">
                  {relativeTime(publication.updatedAt)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
