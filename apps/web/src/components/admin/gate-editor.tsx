'use client'

import { rule as ruleSchema } from '@mcg/core/schema'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useId, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { GateSummary } from '@/lib/types'
import { Button, InlineError, Panel } from '../ui'

export function GateEditor({
  gate,
  canEdit,
  stats,
}: {
  gate: GateSummary
  canEdit: boolean
  stats: { checks: number; passed: number } | undefined
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(gate.rule, null, 2))
  const [localError, setLocalError] = useState<string>()
  const fieldId = useId()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async () => {
      const parsed = ruleSchema.safeParse(JSON.parse(draft))
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new Error(
          issue ? `${issue.path.join('.') || 'rule'}: ${issue.message}` : 'Invalid rule',
        )
      }
      return api.patch(`/admin/gates/${gate.id}/rule`, { rule: parsed.data })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
      void queryClient.invalidateQueries({ queryKey: ['gate'] })
    },
  })

  const onChange = (value: string) => {
    setDraft(value)
    save.reset()
    try {
      JSON.parse(value)
      setLocalError(undefined)
    } catch {
      setLocalError('This is not valid JSON yet')
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="type-heading text-[1.05rem]">
          <Link href={`/lounge/${gate.id}`} className="hover:text-magenta">
            {gate.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {stats ? `${stats.passed} of ${stats.checks} checks passed` : 'Not checked yet'}
        </p>
      </div>
      <label htmlFor={fieldId} className="mt-3 block text-sm text-ink-soft">
        Rule as JSON. Groups use <code className="font-mono">all</code> or{' '}
        <code className="font-mono">any</code>; conditions are erc721, erc20, native and spl.
      </label>
      <textarea
        id={fieldId}
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        readOnly={!canEdit}
        rows={10}
        spellCheck={false}
        className="mt-2 w-full rounded-control border border-line bg-paper p-3 font-mono text-[0.8rem] leading-relaxed outline-none focus:border-ink read-only:text-ink-soft"
      />
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            loading={save.isPending}
            disabled={Boolean(localError)}
            onClick={() => save.mutate()}
          >
            Save rule
          </Button>
          {save.isSuccess ? (
            <span className="text-sm text-go">Saved. New checks use this rule.</span>
          ) : null}
        </div>
      ) : null}
      {localError && canEdit ? <p className="mt-2 text-sm text-wait">{localError}</p> : null}
      {save.error ? (
        <div className="mt-2">
          <InlineError>
            {save.error instanceof ApiError ? save.error.message : (save.error as Error).message}
          </InlineError>
        </div>
      ) : null}
    </Panel>
  )
}
