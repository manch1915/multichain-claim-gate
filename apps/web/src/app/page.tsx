import { Fuel, PenLine, Sheet, ShieldCheck } from 'lucide-react'
import { ContourLines } from '@/components/contour-lines'
import { RoutePanel } from '@/components/route-panel'

const legend = [
  {
    icon: PenLine,
    title: 'One signature to sign in',
    body: 'SIWE for EVM wallets, Sign In With Solana for Phantom and friends. The server writes the message, keeps a one-time nonce and sets an httpOnly session cookie.',
  },
  {
    icon: Fuel,
    title: 'Claims cost the user nothing',
    body: 'A cumulative Merkle airdrop. On Sepolia and Base Sepolia an EIP-7702 smart account sends the claim as a user operation and a Pimlico paymaster covers gas. On devnet the backend is the fee payer.',
  },
  {
    icon: ShieldCheck,
    title: 'Access checked on the server',
    body: 'Rules such as "a pass, or 100 MRD on any network" run against live balances on every request. The lounge content never reaches a wallet that does not qualify.',
  },
  {
    icon: Sheet,
    title: 'An admin view for the project team',
    body: 'Upload a CSV whitelist, preview the Merkle root before publishing, follow claims by network and edit access rules.',
  },
]

export default function HomePage() {
  return (
    <>
      <section
        className="relative -mx-4 overflow-hidden px-4 pt-12 pb-10 sm:-mx-6 sm:px-6 sm:pt-16"
        aria-labelledby="hero-title"
      >
        <ContourLines className="-top-20 -right-32 w-[900px] max-w-none" />
        <div className="relative max-w-3xl">
          <h1 id="hero-title" className="type-chart text-[2.1rem] text-ink sm:text-[3.1rem]">
            Claim MRD on three testnets, then walk into the holders lounge.
          </h1>
          <p className="mt-5 max-w-2xl text-[1.06rem] text-ink-soft">
            One modal for MetaMask, Phantom, Coinbase Wallet and anything on WalletConnect. You sign
            once, the backend pays the gas, and the lounge checks your balances before it opens.
          </p>
        </div>
        <div className="relative">
          <RoutePanel />
        </div>
      </section>

      <section aria-labelledby="legend-title" className="mt-6 border-t border-line pt-10">
        <h2 id="legend-title" className="type-heading text-xl">
          How the route works
        </h2>
        <ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {legend.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-line-strong text-ink">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="mt-1 max-w-prose text-[0.95rem] text-ink-soft">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
