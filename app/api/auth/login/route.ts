import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import { normalizeEmail } from '@/lib/auth/email-verification'
import { checkActiveWebLicenseForUser, getWebProfile } from '@/lib/web-license/auth'
import {
  CurrentAgreementVersions,
  recordUserAgreements
} from '@/lib/legal-agreements'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  agreementsAccepted: z.literal(true),
  agreementVersions: z.object({
    terms: z.literal(CurrentAgreementVersions.terms),
    privacy: z.literal(CurrentAgreementVersions.privacy)
  })
})

export async function POST(request: Request) {
  try {
    const body = LoginSchema.parse(await request.json())
    const email = normalizeEmail(body.email)
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: body.password
    })

    if (error || !data.user) {
      return json({ success: false, message: toChineseAuthError(error?.message || '邮箱或密码错误') }, { status: 401 })
    }

    await recordUserAgreements(
      createSupabaseServiceRoleClient(),
      data.user.id,
      'login'
    )

    const profile = await getWebProfile(data.user.id)
    if (profile?.role === 'admin') {
      return json({
        success: true,
        redirectTo: '/admin/licenses',
        licenseActive: false,
        profile
      })
    }

    const license = await checkActiveWebLicenseForUser(data.user)
    if (license.ok) {
      return json({
        success: true,
        redirectTo: '/dashboard',
        licenseActive: true,
        profile: license.profile
      })
    }

    return json({
      success: true,
      redirectTo: '/activate',
      licenseActive: false,
      profile
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请输入邮箱和密码' }, { status: 400 })
    }

    console.error('[auth-login]', error instanceof Error ? error.message : error)
    return json({ success: false, message: toChineseAuthError(error instanceof Error ? error.message : null) }, { status: 500 })
  }
}
