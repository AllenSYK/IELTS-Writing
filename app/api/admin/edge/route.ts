import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const ProxySchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.unknown().optional()
})

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = ProxySchema.parse(await request.json())
    const data = await callAdminFunction(body.action, body.payload, { request })
    return json(data)
  } catch (error) {
    return apiError(error, '管理员请求失败。')
  }
}
