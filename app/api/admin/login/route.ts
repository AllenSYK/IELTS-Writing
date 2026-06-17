import { z } from 'zod'
import { createAdminSession } from '@/lib/admin-auth'
import { AdminEdgeError, callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const LoginSchema = z.object({
  password: z.string().min(1)
})

export async function POST(request: Request) {
  try {
    const body = LoginSchema.parse(await request.json())
    const result = await callAdminFunction<{ ok: boolean; error?: string }>('login', { password: body.password }, { request })
    if (!result.ok) {
      return json({ error: 'invalid_credentials' }, { status: 401 })
    }
    await createAdminSession()
    return json({ ok: true })
  } catch (error) {
    if (error instanceof AdminEdgeError && (error.status === 401 || error.code === 'invalid_credentials')) {
      return json({ error: 'invalid_credentials' }, { status: 401 })
    }
    if (error instanceof AdminEdgeError && error.code === 'rate_limited') {
      return json({ error: 'rate_limited', message: '尝试次数过多，请稍后再试。' }, { status: 429 })
    }
    return apiError(error, '登录失败。')
  }
}
