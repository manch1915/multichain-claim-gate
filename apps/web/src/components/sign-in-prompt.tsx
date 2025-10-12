'use client'

import { useAppKit } from '@reown/appkit/react'
import { Wallet } from 'lucide-react'
import { appKitConfigured } from '@/lib/appkit'
import { Button, Panel } from './ui'

export function SignInPrompt({ title, body }: { title: string; body: string }) {
  return (
    <Panel className="flex flex-col items-start gap-4 p-6 sm:p-8">
      <h2 className="type-heading text-xl">{title}</h2>
      <p className="max-w-prose text-ink-soft">{body}</p>
      {appKitConfigured ? (
        <OpenButton />
      ) : (
        <p className="text-sm text-muted">Wallet connections are switched off on this build.</p>
      )}
    </Panel>
  )
}

function OpenButton() {
  const { open } = useAppKit()
  return (
    <Button icon={<Wallet className="size-4" aria-hidden />} onClick={() => open()}>
      Connect wallet
    </Button>
  )
}
