import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { BRAND_DESCRIPTION, BRAND_NAME } from '@/lib/brand'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { accountDisplayName } from '@/lib/phone-auth'
import '../admin.css'

export const metadata: Metadata = {
  title: {
    template: `%s | ${BRAND_NAME} 管理中心`,
    default: `${BRAND_NAME} 管理中心`,
  },
  description: `${BRAND_DESCRIPTION} 管理后台。`,
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentSupabaseUser().catch(() => null)

  return (
    <AdminLayoutClient adminEmail={user ? accountDisplayName(user) : undefined}>
      {children}
    </AdminLayoutClient>
  )
}
