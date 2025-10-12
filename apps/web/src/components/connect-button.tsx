'use client'

import { useAppKit } from '@reown/appkit/react'
import { Wallet } from 'lucide-react'
import { shortAddress } from '@mcg/core'
import { useSession } from '@/hooks/use-session'
import { appKitConfigured } from '@/lib/appkit'
import { Button } from './ui'

export function ConnectButton() {
  if (!appKitConfigured) {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled
        title="Set NEXT_PUBLIC_REOWN_PROJECT_ID to enable wallets"
      >
        Wallets offline
      </Button>
    )
  }
  return <ConnectButtonInner />
}

function ConnectButtonInner() {
  const { open } = useAppKit()
  const session = useSession()
  const accounts = session.data?.accounts ?? []

  if (accounts.length === 0) {
    return (
      <Button size="sm" icon={<Wallet className="size-4" aria-hidden />} onClick={() => open()}>
        Connect wallet
      </Button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => open({ view: 'Account' })}
      className="flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface pr-3 pl-2 text-sm hover:border-ink"
      aria-label={`Signed in as ${accounts.map((a) => a.address).join(' and ')}. Open wallet menu`}
    >
      <span className="flex -space-x-1" aria-hidden>
        {accounts.map((account) => (
          <span
            key={account.family}
            className={`grid size-5 place-items-center rounded-full border-2 border-surface text-[0.6rem] font-semibold text-white ${
              account.family === 'evm' ? 'bg-[#2f5cf5]' : 'bg-[#8b5cf6]'
            }`}
          >
            {account.family === 'evm' ? 'E' : 'S'}
          </span>
        ))}
      </span>
      <span className="font-mono text-[0.82rem]">{shortAddress(accounts[0]?.address ?? '')}</span>
      {accounts.length > 1 ? <span className="text-muted">+1</span> : null}
    </button>
  )
}
