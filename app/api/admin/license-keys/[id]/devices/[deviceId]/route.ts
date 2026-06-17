import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; deviceId: string }> }) {
  try {
    await requireAdmin()
    const { id, deviceId } = await params
    const data = await callAdminFunction('deactivateDevice', { licenseId: id, deviceId })
    return json(data)
  } catch (error) {
    return apiError(error, '无法解绑设备。')
  }
}
