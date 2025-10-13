import type { Metadata } from 'next'
import Link from 'next/link'
import { GateView } from '@/components/gate/gate-view'
import { PageIntro } from '@/components/page-intro'

const titles: Record<string, { title: string; body: string }> = {
  'holders-lounge': {
    title: 'Holders Lounge',
    body: 'Release notes, the testnet roadmap and a private chat for Meridian holders.',
  },
  'founders-circle': {
    title: 'Founders Circle',
    body: 'Early access to vault strategies. Needs both a pass and a bigger MRD position.',
  },
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return { title: titles[id]?.title ?? 'Gated page' }
}

export default async function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const copy = titles[id] ?? {
    title: 'Gated page',
    body: 'Access depends on what your wallets hold.',
  }
  return (
    <>
      <p className="pt-8 text-sm">
        <Link href="/lounge" className="text-muted hover:text-ink">
          All gated pages
        </Link>
      </p>
      <PageIntro title={copy.title} body={copy.body} />
      <GateView id={id} />
    </>
  )
}
