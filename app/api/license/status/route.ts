import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser, requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ authenticated: false, active: false, redirectTo: '/login' }, { status: 401 })
  }

  const check = await requireActiveWebLicense()
  if (check.ok) {
    return json({
      authenticated: true,
      active: true,
      redirectTo: '/dashboard',
      email: user.email,
      profile: check.profile,
      activation: check.activation,
      license: check.license
    })
  }

  const service = createSupabaseServiceRoleClient()
  const { data: profile } = await service
    .from('profiles')
    .select('id, email, role, license_status, license_expires_at')
    .eq('id', user.id)
    .maybeSingle()

  return json({
    authenticated: true,
    active: false,
    redirectTo: '/activate',
    email: user.email,
    profile,
    code: check.code,
    message: check.message
  })
}
