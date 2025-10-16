import type { Metadata } from 'next'
import { PageIntro } from '@/components/page-intro'
import { PortfolioView } from '@/components/portfolio/portfolio-view'

export const metadata: Metadata = { title: 'Portfolio' }

export default function PortfolioPage() {
  return (
    <>
      <PageIntro
        title="Portfolio"
        body="Balances and recent transactions for every wallet linked to your session, network by network."
      />
      <PortfolioView />
    </>
  )
}
