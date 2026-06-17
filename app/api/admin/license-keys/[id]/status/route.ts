import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const StatusSchema = z.object({
  status: z.enum(['unused', 'active', 'expired', 'suspended', 'revoked', 'disabled'])
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = StatusSchema.parse(await request.json())
    const data = await callAdminFunction('updateStatus', { id, status: body.status })
    return json(data)
  } catch (error) {
    return apiError(error, '无法更新状态。')
  }
}
