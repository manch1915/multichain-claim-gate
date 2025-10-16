'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Repeat, RefreshCw } from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import type { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import { formatAmount, formatUsd, relativeTime, shortHash } from '@/lib/format'
import type { ChainPortfolio, Portfolio } from '@/lib/types'
import { SignInPrompt } from '../sign-in-prompt'
import { Address, Badge, Button, ChainMark, InlineError, Panel, Skeleton } from '../ui'

export function PortfolioView() {
  const session = useSession()
  const signedIn = Boolean(session.data?.accounts.length)
  const portfolio = useQuery({
    queryKey: ['portfolio'],
    enabled: signedIn,
    queryFn: () => api.get<Portfolio>('/portfolio'),
  })

  if (session.isLoading) return <PortfolioSkeleton />
  if (!signedIn) {
    return (
      <SignInPrompt
        title="Sign in to see balances"
        body="Native coins, MRD, test USDC and passes on Sepolia, Base Sepolia and Solana devnet, read live from each network."
      />
    )
  }
  if (portfolio.isLoading) return <PortfolioSkeleton />
  if (portfolio.error) return <InlineError>{(portfolio.error as ApiError).message}</InlineError>
  if (!portfolio.data) return null

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          Testnet assets have no market value. Dollar figures use mainnet prices for reference only.
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="size-4" aria-hidden />}
          loading={portfolio.isFetching}
          onClick={() => void portfolio.refetch()}
        >
          Refresh
        </Button>
      </div>
      {portfolio.data.chains.map((chain) => (
        <ChainSection key={chain.chain} chain={chain} prices={portfolio.data.referencePrices} />
      ))}
    </div>
  )
}

function ChainSection({
  chain,
  prices,
}: {
  chain: ChainPortfolio
  prices: Record<string, number>
}) {
  const visible = chain.assets.filter(
    (asset) => asset.kind === 'native' || BigInt(asset.balance) > 0n,
  )
  const hidden = chain.assets.length - visible.length

  return (
    <Panel className="overflow-hidden" aria-labelledby={`chain-${chain.chain}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id={`chain-${chain.chain}`} className="type-heading flex items-center gap-2 text-lg">
          <ChainMark chain={chain.chain} />
          {chain.name}
        </h2>
        <Address value={chain.address} />
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="px-5 py-4">
          <h3 className="text-sm font-medium text-muted">Assets</h3>
          <table className="mt-2 w-full text-[0.95rem]">
            <thead className="sr-only">
              <tr>
                <th>Asset</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((asset) => {
                const amount = formatAmount(asset.balance, asset.decimals)
                const price =
                  asset.kind === 'native'
                    ? prices[asset.symbol]
                    : asset.symbol === 'USDC'
                      ? 1
                      : undefined
                const usd =
                  price !== undefined
                    ? (Number(asset.balance) / 10 ** asset.decimals) * price
                    : undefined
                return (
                  <tr
                    key={`${asset.symbol}-${asset.address}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{asset.symbol}</span>
                      <span className="ml-2 text-sm text-muted">{asset.name}</span>
                    </td>
                    <td className="nums py-2.5 text-right">
                      {asset.error ? (
                        <span className="text-sm text-stop">{asset.error}</span>
                      ) : (
                        <>
                          {amount}
                          {usd !== undefined && usd > 0 ? (
                            <span className="block text-xs text-muted">
                              ≈ {formatUsd(usd)} at mainnet price
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hidden > 0 ? (
            <p className="mt-2 text-sm text-muted">
              {hidden} tracked {hidden === 1 ? 'token has' : 'tokens have'} a zero balance.
            </p>
          ) : null}
        </div>

        <div className="border-t border-line px-5 py-4 lg:border-t-0 lg:border-l">
          <h3 className="text-sm font-medium text-muted">Recent transactions</h3>
          {chain.historyError ? (
            <p className="mt-3 text-sm text-ink-soft">{chain.historyError}</p>
          ) : chain.history.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              No transactions yet. Sponsored claims are sent by the backend, so they show up as
              token transfers rather than transactions from your address.
            </p>
          ) : (
            <ul className="mt-2 grid">
              {chain.history.map((tx) => (
                <li
                  key={tx.hash}
                  className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
                >
                  <DirectionIcon direction={tx.direction} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{tx.summary}</span>
                    <span className="text-xs text-muted">{relativeTime(tx.timestamp)}</span>
                  </span>
                  {tx.status === 'failed' ? <Badge tone="stop">failed</Badge> : null}
                  <a
                    href={tx.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-ink-soft hover:text-ink"
                    aria-label={`Open transaction ${tx.hash} in the explorer`}
                  >
                    {shortHash(tx.hash, 4)}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}

function DirectionIcon({ direction }: { direction: 'in' | 'out' | 'self' }) {
  const Icon = direction === 'in' ? ArrowDownLeft : direction === 'out' ? ArrowUpRight : Repeat
  const label = direction === 'in' ? 'Incoming' : direction === 'out' ? 'Outgoing' : 'Transaction'
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunk text-ink-soft">
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function PortfolioSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden>
      {[0, 1].map((i) => (
        <Panel key={i} className="grid gap-3 p-5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </Panel>
      ))}
    </div>
  )
}
