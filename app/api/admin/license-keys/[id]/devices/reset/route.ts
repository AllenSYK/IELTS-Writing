import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = await callAdminFunction('resetDevices', { id })
    return json(data)
  } catch (error) {
    return apiError(error, '无法解绑设备。')
  }
}
