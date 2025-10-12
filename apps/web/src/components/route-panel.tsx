'use client'

import { useAppKit } from '@reown/appkit/react'
import { ExternalLink } from 'lucide-react'
import { useRouteProgress } from '@/hooks/use-route-progress'
import { appKitConfigured } from '@/lib/appkit'
import { faucets } from '@/lib/networks'
import { CourseChart, type Waypoint } from './course-chart'
import { Button, ButtonLink, Panel } from './ui'

const waypoints: Waypoint[] = [
  { title: 'Get test funds', note: 'optional, claims are gasless' },
  { title: 'Connect and sign in', note: 'one signature, no gas' },
  { title: 'Claim MRD', note: 'paymaster covers the fee' },
  { title: 'Enter the lounge', note: 'checked on the server' },
]

export function RoutePanel() {
  const progress = useRouteProgress()
  return (
    <div className="mt-10">
      <CourseChart waypoints={waypoints} current={progress.loading ? 0 : progress.current} />
      <Panel className="mt-8 p-5 sm:p-6" aria-live="polite">
        <NextStep current={progress.current} />
      </Panel>
    </div>
  )
}

function NextStep({ current }: { current: number }) {
  switch (current) {
    case 0:
      return <FundsStep />
    case 1:
      return <ConnectStep />
    case 2:
      return (
        <StepBody
          title="Join the demo list and claim 250 MRD"
          body="Add your wallet to the whitelist with one click. The new Merkle root goes on-chain within a few seconds, then the claim is free on every network."
          action={<ButtonLink href="/claim">Go to the claim</ButtonLink>}
        />
      )
    case 3:
      return (
        <StepBody
          title="Open the holders lounge"
          body="With 100 MRD on any network, or a Meridian Pass on Base Sepolia, the lounge lets you in and can hand out a one-time Telegram invite."
          action={<ButtonLink href="/lounge/holders-lounge">Open the lounge</ButtonLink>}
        />
      )
    default:
      return (
        <StepBody
          title="Route complete"
          body="You signed in, claimed and passed the gate. The portfolio shows the tokens and transactions on each network."
          action={
            <ButtonLink href="/portfolio" variant="secondary">
              View portfolio
            </ButtonLink>
          }
        />
      )
  }
}

function FundsStep() {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
      <div>
        <h2 className="type-heading text-lg">Top up a little test ETH or SOL</h2>
        <p className="mt-1.5 max-w-prose text-ink-soft">
          You do not need it for the claim. It is only for minting a pass yourself or seeing a
          balance in the portfolio. Any of these faucets will do.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {faucets.map((faucet) => (
            <li key={faucet.network}>
              <span className="text-muted">{faucet.network}: </span>
              {faucet.links.map((link, i) => (
                <span key={link.href}>
                  {i > 0 ? ', ' : null}
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-magenta"
                  >
                    {link.label}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </div>
      <ConnectAction label="Skip and connect" variant="secondary" />
    </div>
  )
}

function ConnectStep() {
  return (
    <StepBody
      title="Connect a wallet and sign in"
      body="Pick an EVM or a Solana wallet, or both. The signature proves the wallet is yours and costs nothing. You can link one of each to the same session."
      action={<ConnectAction label="Connect wallet" />}
    />
  )
}

function ConnectAction({
  label,
  variant = 'primary',
}: {
  label: string
  variant?: 'primary' | 'secondary'
}) {
  if (!appKitConfigured) {
    return (
      <p className="max-w-56 text-sm text-muted">
        Wallet connections are switched off on this build. Set a Reown project id to enable them.
      </p>
    )
  }
  return <OpenModalButton label={label} variant={variant} />
}

function OpenModalButton({ label, variant }: { label: string; variant: 'primary' | 'secondary' }) {
  const { open } = useAppKit()
  return (
    <Button variant={variant} onClick={() => open()}>
      {label}
    </Button>
  )
}

function StepBody({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="type-heading text-lg">{title}</h2>
        <p className="mt-1.5 max-w-prose text-ink-soft">{body}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
