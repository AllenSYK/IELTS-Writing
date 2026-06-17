import { redirect } from 'next/navigation'
import { checkActiveWebLicenseForUser, getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'

export default async function RootPage() {
  const user = await getCurrentSupabaseUser()
  if (!user) redirect('/login')

  const profile = await getWebProfile(user.id)
  if (profile?.role === 'admin') redirect('/admin/licenses')

  const license = await checkActiveWebLicenseForUser(user)
  if (license.ok) redirect('/dashboard')

  redirect('/activate')
}
