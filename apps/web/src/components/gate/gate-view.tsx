'use client'

import { collectConditions } from '@mcg/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, LockKeyhole, Send, Ticket } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useActionStatus } from '@/hooks/use-action'
import { useSession } from '@/hooks/use-session'
import type { ApiError } from '@/lib/api'
import { api } from '@/lib/api'
import type { ActionView, GateCheck } from '@/lib/types'
import { SignInPrompt } from '../sign-in-prompt'
import { Badge, Button, ButtonLink, InlineError, Panel, Skeleton } from '../ui'
import { RequirementTree } from './requirement-tree'

export function GateView({ id }: { id: string }) {
  const session = useSession()
  const accountsKey = session.data?.accounts.map((a) => a.address).join(',')
  const check = useQuery({
    queryKey: ['gate', id, accountsKey],
    queryFn: () => api.get<GateCheck>(`/gates/${id}`),
    enabled: !session.isLoading,
  })

  if (check.isLoading || session.isLoading) {
    return (
      <Panel className="grid gap-4 p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </Panel>
    )
  }
  if (check.error) return <InlineError>{(check.error as ApiError).message}</InlineError>
  if (!check.data) return null
  const data = check.data
  const signedIn = Boolean(session.data?.accounts.length)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Panel className="h-fit p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-heading text-lg">Requirements</h2>
          <Badge tone={data.passed ? 'go' : 'neutral'}>
            {data.passed ? 'Access granted' : 'Locked'}
          </Badge>
        </div>
        <div className="mt-5">
          <RequirementTree result={data.result} />
        </div>
        {!data.passed && signedIn ? <HowToPass check={data} /> : null}
      </Panel>

      {data.passed && data.content ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Panel as="article" className="p-6 sm:p-8">
            <h2 className="type-chart text-[1.6rem]">{data.content.heading}</h2>
            <div className="mt-4 grid max-w-prose gap-4 text-ink-soft">
              {data.content.body.split('\n\n').map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {data.telegramAvailable ? <TelegramInvite id={id} /> : null}
              {data.content.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-control border border-line-strong px-4 hover:border-ink"
                >
                  {link.label}
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ))}
            </div>
          </Panel>
        </motion.div>
      ) : signedIn ? (
        <LockedPanel />
      ) : (
        <SignInPrompt
          title="Sign in to check your access"
          body="The server reads your balances on every network you link and decides whether to show this page."
        />
      )}
    </div>
  )
}

function LockedPanel() {
  return (
    <Panel className="flex flex-col items-center justify-center gap-3 border-dashed bg-transparent p-10 text-center">
      <LockKeyhole className="size-8 text-muted" aria-hidden />
      <p className="type-heading text-lg">This page stays closed for now</p>
      <p className="max-w-sm text-ink-soft">
        Meet the requirements on the left and refresh. Nothing from this page is sent to your
        browser until then.
      </p>
    </Panel>
  )
}

function HowToPass({ check }: { check: GateCheck }) {
  const conditions = collectConditions(check.gate.rule)
  const wantsPass = conditions.some((condition) => condition.kind === 'erc721')
  const wantsMrd = conditions.some(
    (condition) => condition.kind === 'erc20' || condition.kind === 'spl',
  )
  return (
    <div className="mt-6 grid gap-3 border-t border-line pt-5">
      <p className="text-sm font-medium">Ways to qualify</p>
      {wantsMrd ? (
        <ButtonLink href="/claim" variant="secondary">
          Claim MRD first
        </ButtonLink>
      ) : null}
      {wantsPass ? <MintPassButton /> : null}
    </div>
  )
}

function MintPassButton() {
  const queryClient = useQueryClient()
  const [actionId, setActionId] = useState<string>()
  const action = useActionStatus(actionId)
  const mint = useMutation({
    mutationFn: async () => (await api.post<{ action: ActionView }>('/claims/pass')).action,
    onSuccess: (result) => setActionId(result.id),
  })
  const status = action.data?.status

  useEffect(() => {
    if (status === 'confirmed') void queryClient.invalidateQueries({ queryKey: ['gate'] })
  }, [status, queryClient])

  if (status === 'confirmed') {
    return <p className="text-sm text-go">Your Meridian Pass is minted. Checking access again…</p>
  }
  return (
    <>
      <Button
        variant="secondary"
        icon={<Ticket className="size-4" aria-hidden />}
        loading={mint.isPending || status === 'pending'}
        onClick={() => mint.mutate()}
      >
        Mint a free Meridian Pass
      </Button>
      {mint.error ? <InlineError>{(mint.error as ApiError).message}</InlineError> : null}
      {status === 'failed' ? (
        <InlineError>{action.data?.error ?? 'The mint failed'}</InlineError>
      ) : null}
    </>
  )
}

function TelegramInvite({ id }: { id: string }) {
  const invite = useMutation({
    mutationFn: async () =>
      (await api.post<{ invite: { url: string; expiresAt: string } }>(`/gates/${id}/telegram`))
        .invite,
  })
  if (invite.data) {
    return (
      <a
        href={invite.data.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center gap-2 rounded-control bg-magenta px-4 font-medium text-magenta-ink hover:brightness-110"
      >
        <Send className="size-4" aria-hidden />
        Join the Telegram group
      </a>
    )
  }
  return (
    <div className="grid gap-2">
      <Button
        icon={<Send className="size-4" aria-hidden />}
        loading={invite.isPending}
        onClick={() => invite.mutate()}
      >
        Get a one-time Telegram invite
      </Button>
      {invite.error ? <InlineError>{(invite.error as ApiError).message}</InlineError> : null}
    </div>
  )
}
