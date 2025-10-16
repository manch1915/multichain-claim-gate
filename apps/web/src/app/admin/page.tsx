import type { Metadata } from 'next'
import { AdminView } from '@/components/admin/admin-view'
import { PageIntro } from '@/components/page-intro'

export const metadata: Metadata = { title: 'Admin' }

export default function AdminPage() {
  return (
    <>
      <PageIntro
        title="Campaign admin"
        body="What the project team sees: who is on the list, which root is live on each network, how claims are going and the rules behind each gated page."
      />
      <AdminView />
    </>
  )
}
