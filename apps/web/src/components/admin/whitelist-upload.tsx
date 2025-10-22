'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { useId, useState } from 'react'
import type { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import { formatAmount, plural, shortHash } from '@/lib/format'
import { DEMO_CAMPAIGN } from '@/lib/networks'
import type { WhitelistPreview } from '@/lib/types'
import { Button, InlineError, Panel } from '../ui'

const SAMPLE = `address,amount
0x8ba1f109551bD432803012645Ac136ddd64DBA72,1200
0x2546BcD3c84621e976D8185a91A922aE77ECEc30,640
0xbDA5747bFD65F08deb54cb465eB87D40e51B197E,120
5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG,640`

export function WhitelistUpload({ canEdit }: { canEdit: boolean }) {
  const [csv, setCsv] = useState(SAMPLE)
  const fieldId = useId()
  const queryClient = useQueryClient()

  const preview = useMutation({
    mutationFn: () =>
      api.post<WhitelistPreview>(`/campaigns/${DEMO_CAMPAIGN}/whitelist/preview`, { csv }),
  })
  const importList = useMutation({
    mutationFn: () =>
      api.post<WhitelistPreview & { added: number; raised: number }>(
        `/admin/campaigns/${DEMO_CAMPAIGN}/whitelist`,
        { csv },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setCsv(await file.text())
    preview.reset()
  }

  const result = importList.data ?? preview.data

  return (
    <Panel className="p-5 sm:p-6" aria-labelledby={`${fieldId}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${fieldId}-title`} className="type-heading text-lg">
            Whitelist upload
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            One wallet per line: address and amount in MRD. EVM and Solana addresses can be mixed.
            Amounts only go up, so wallets that already claimed are never short-changed.
          </p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-control border border-line-strong px-3 text-sm hover:border-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
          <FileUp className="size-4" aria-hidden />
          Choose a CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
      </div>

      <label htmlFor={fieldId} className="sr-only">
        Whitelist CSV
      </label>
      <textarea
        id={fieldId}
        value={csv}
        onChange={(event) => {
          setCsv(event.target.value)
          preview.reset()
          importList.reset()
        }}
        rows={7}
        spellCheck={false}
        className="mt-4 w-full rounded-control border border-line bg-paper p-3 font-mono text-[0.82rem] leading-relaxed text-ink outline-none focus:border-ink"
      />

      <div className="mt-3 flex flex-wrap gap-3">
        <Button variant="secondary" loading={preview.isPending} onClick={() => preview.mutate()}>
          Preview the tree
        </Button>
        <Button
          loading={importList.isPending}
          disabled={!canEdit || !preview.data || preview.data.valid === 0}
          onClick={() => importList.mutate()}
          title={canEdit ? undefined : 'Needs an admin wallet'}
        >
          Import and publish
        </Button>
      </div>

      {preview.error ? (
        <div className="mt-3">
          <InlineError>{(preview.error as ApiError).message}</InlineError>
        </div>
      ) : null}
      {importList.error ? (
        <div className="mt-3">
          <InlineError>{(importList.error as ApiError).message}</InlineError>
        </div>
      ) : null}

      {result ? (
        <div
          className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2"
          aria-live="polite"
        >
          <div>
            <p className="font-medium">
              {result.valid} valid {result.valid === 1 ? 'row' : 'rows'}
              {importList.data
                ? `, ${importList.data.added} added, ${importList.data.raised} raised`
                : null}
            </p>
            <p className="mt-1 text-ink-soft">
              EVM: {plural(result.totals.evm.count, 'wallet', 'wallets')},{' '}
              {formatAmount(result.totals.evm.amount, 18)} MRD. Solana:{' '}
              {plural(result.totals.solana.count, 'wallet', 'wallets')},{' '}
              {formatAmount(result.totals.solana.amount, 6)} MRD.
            </p>
            {'roots' in result && result.roots ? (
              <dl className="mt-3 grid gap-1 font-mono text-[0.82rem]">
                {result.roots.evm ? (
                  <div className="flex gap-2">
                    <dt className="text-muted">EVM root</dt>
                    <dd title={result.roots.evm}>{shortHash(result.roots.evm, 8)}</dd>
                  </div>
                ) : null}
                {result.roots.solana ? (
                  <div className="flex gap-2">
                    <dt className="text-muted">Solana root</dt>
                    <dd title={result.roots.solana}>{shortHash(`0x${result.roots.solana}`, 8)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
          <div>
            {result.issueCount === 0 ? (
              <p className="text-go">No problems found.</p>
            ) : (
              <>
                <p className="font-medium text-stop">
                  {result.issueCount} {result.issueCount === 1 ? 'row needs' : 'rows need'} fixing
                </p>
                <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto text-ink-soft">
                  {result.issues.map((issue) => (
                    <li key={`${issue.line}-${issue.message}`}>
                      <span className="font-mono text-muted">line {issue.line}</span>{' '}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
