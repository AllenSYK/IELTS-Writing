import { redirect } from 'next/navigation'
import { getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { AdminLoginClient } from './AdminLoginClient'
import { accountDisplayName } from '@/lib/phone-auth'

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
    redirect('/admin')
  }

  return (
    <AdminLoginClient
      currentEmail={accountDisplayName(user)}
      initialReason="not_admin"
    />
  )
}
