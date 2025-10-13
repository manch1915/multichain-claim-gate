import type { Metadata } from 'next'
import { GateList } from '@/components/gate/gate-list'
import { PageIntro } from '@/components/page-intro'

export const metadata: Metadata = { title: 'Lounge' }

export default function LoungePage() {
  return (
    <>
      <PageIntro
        title="Gated pages"
        body="Each page has its own rule. The server checks it against live balances on every network you have linked, every time you open the page."
      />
      <GateList />
    </>
  )
}
