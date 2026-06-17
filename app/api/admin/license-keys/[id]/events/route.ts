import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = await callAdminFunction('listEvents', { licenseId: id, limit: 200 })
    return json(data)
  } catch (error) {
    return apiError(error, '无法加载激活码日志。')
  }
}
