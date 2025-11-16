'use client'

import { collectConditions, describeCondition } from '@mcg/core/describe'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import type { GateSummary } from '@/lib/types'
import { InlineError, Panel, Skeleton } from '../ui'

export function GateList() {
  const gates = useQuery({
    queryKey: ['gates'],
    queryFn: async () => (await api.get<{ gates: GateSummary[] }>('/gates')).gates,
  })

  if (gates.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-hidden>
        {[0, 1].map((i) => (
          <Panel key={i} className="grid gap-3 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Panel>
        ))}
      </div>
    )
  }
  if (gates.error) return <InlineError>{(gates.error as ApiError).message}</InlineError>
  if (!gates.data?.length) {
    return (
      <p className="text-ink-soft">No gated pages yet. Admins can add one from the admin view.</p>
    )
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {gates.data.map((gate) => {
        const conditions = collectConditions(gate.rule)
        return (
          <li key={gate.id}>
            <Link
              href={`/lounge/${gate.id}`}
              className="group block h-full rounded-panel border border-line bg-surface p-6 transition-colors hover:border-ink"
            >
              <span className="flex items-start justify-between gap-4">
                <span className="type-heading text-xl">{gate.title}</span>
                <ArrowUpRight
                  className="size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-magenta"
                  aria-hidden
                />
              </span>
              <span className="mt-2 block text-ink-soft">{gate.summary}</span>
              <span className="mt-4 block text-sm text-muted">
                {gate.rule.kind === 'all' ? 'Needs all of: ' : 'Any one of: '}
                {conditions.slice(0, 3).map(describeCondition).join('; ')}
                {conditions.length > 3 ? `; and ${conditions.length - 3} more` : ''}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
