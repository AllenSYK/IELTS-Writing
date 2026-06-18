import { z } from 'zod'
import { normalizeEmail } from '@/lib/auth/email-verification'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getWebProfile } from '@/lib/web-license/auth'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

export async function POST(request: Request) {
  try {
    const body = LoginSchema.parse(await request.json())
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(body.email),
      password: body.password
    })

    if (error || !data.user) {
      return json(
        {
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: toChineseAuthError(error?.message || '管理员邮箱或密码错误')
        },
        { status: 401 }
      )
    }

    const profile = await getWebProfile(data.user.id)
    if (profile?.role !== 'admin') {
      await supabase.auth.signOut({ scope: 'local' })
      return json(
        {
          success: false,
          code: 'NOT_ADMIN',
          message: '该账号不是管理员账号。'
        },
        { status: 403 }
      )
    }

    return json({
      success: true,
      redirectTo: '/admin/licenses'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请输入有效的管理员邮箱和密码。' }, { status: 400 })
    }

    console.error('[admin-login]', error instanceof Error ? error.message : error)
    return json({ success: false, message: '管理员登录失败，请稍后重试。' }, { status: 500 })
  }
}
