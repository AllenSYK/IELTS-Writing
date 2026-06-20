import type { ReactNode } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { accountDisplayName } from '@/lib/phone-auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentSupabaseUser().catch(() => null)
  const profile = user ? await getWebProfile(user.id).catch(() => null) : null

  return (
    <AdminLayoutClient adminEmail={profile?.role === 'admin' && user ? accountDisplayName(user) : undefined}>
      {children}
    </AdminLayoutClient>
  )
}
