import { redirect } from 'next/navigation'
import { getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { AdminLoginClient } from './AdminLoginClient'

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const user = await getCurrentSupabaseUser()

  if (!user) {
    return <AdminLoginClient initialReason={reason} />
  }

  const profile = await getWebProfile(user.id)
  if (profile?.role === 'admin') {
    redirect('/admin/licenses')
  }

  return (
    <AdminLoginClient
      currentEmail={user.email || profile?.email || '未知邮箱'}
      initialReason="not_admin"
    />
  )
}
