import { json } from '@/lib/http'
import { getCurrentSupabaseUser, getWebProfile, requireActiveWebLicense } from '@/lib/web-license/auth'
import { accountDisplayName } from '@/lib/phone-auth'

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ authenticated: false, active: false, redirectTo: '/login' }, { status: 401 })
  }

  const profile = await getWebProfile(user.id)
  if (profile?.role === 'admin') {
    return json({
      authenticated: true,
      active: false,
      licenseActive: false,
      isAdmin: true,
      redirectTo: '/admin/licenses',
      email: user.email,
      phone: user.phone,
      accountLabel: accountDisplayName(user),
      profile
    })
  }

  const check = await requireActiveWebLicense()
  if (check.ok) {
    return json({
      authenticated: true,
      active: true,
      licenseActive: true,
      isAdmin: false,
      redirectTo: '/dashboard',
      email: user.email,
      phone: user.phone,
      accountLabel: accountDisplayName(user),
      profile: check.profile,
      activation: check.activation,
      license: check.license
    })
  }

  return json({
    authenticated: true,
    active: false,
    licenseActive: false,
    isAdmin: false,
    redirectTo: '/activate',
    email: user.email,
    phone: user.phone,
    accountLabel: accountDisplayName(user),
    profile,
    code: check.code,
    message: check.message
  })
}
