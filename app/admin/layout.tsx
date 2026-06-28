import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { accountDisplayName } from '@/lib/phone-auth'

export const metadata: Metadata = {
  title: {
    template: '%s | IELTS Writing 管理中心',
    default: 'IELTS Writing 管理中心',
  },
  description: 'IELTS Writing 管理后台',
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentSupabaseUser().catch(() => null)
  if (!user) {
    redirect('/login?returnTo=/admin')
  }

  const profile = await getWebProfile(user.id).catch(() => null)
  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <AdminLayoutClient adminEmail={accountDisplayName(user)}>
      {children}
    </AdminLayoutClient>
  )
}
