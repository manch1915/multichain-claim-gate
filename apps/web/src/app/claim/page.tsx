import type { Metadata } from 'next'
import { ClaimBoard } from '@/components/claim/claim-board'
import { PageIntro } from '@/components/page-intro'

export const metadata: Metadata = { title: 'Claim' }

export default function ClaimPage() {
  return (
    <>
      <PageIntro
        title="Meridian Genesis Drop"
        body="A retroactive MRD airdrop for early testers, liquidity providers and moderators. Allocations are cumulative, so if yours grows later you only claim the difference."
      />
      <ClaimBoard />
    </>
  )
}
