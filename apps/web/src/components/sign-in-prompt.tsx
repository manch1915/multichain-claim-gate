'use client'

import { Wallet } from 'lucide-react'
import { openWalletModal, walletsEnabled, warmWallet } from '@/lib/wallet'
import { Button, Panel } from './ui'

export function SignInPrompt({ title, body }: { title: string; body: string }) {
  return (
    <Panel className="flex flex-col items-start gap-4 p-6 sm:p-8">
      <h2 className="type-heading text-xl">{title}</h2>
      <p className="max-w-prose text-ink-soft">{body}</p>
      {walletsEnabled ? (
        <OpenButton />
      ) : (
        <p className="text-sm text-muted">Wallet connections are switched off on this build.</p>
      )}
    </Panel>
  )
}

function OpenButton() {
  return (
    <Button
      icon={<Wallet className="size-4" aria-hidden />}
      onPointerEnter={warmWallet}
      onFocus={warmWallet}
      onClick={() => void openWalletModal()}
    >
      Connect wallet
    </Button>
  )
}
