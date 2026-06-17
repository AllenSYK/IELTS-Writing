import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const ExtendSchema = z.object({
  expiresAt: z.string().datetime().nullable()
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = ExtendSchema.parse(await request.json())
    const data = await callAdminFunction('updateKey', { id, expiresAt: body.expiresAt })
    return json(data)
  } catch (error) {
    return apiError(error, '无法修改到期时间。')
  }
}
