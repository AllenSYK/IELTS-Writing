import { clearAdminSession } from '@/lib/admin-auth'
import { json } from '@/lib/http'

export async function POST() {
  await clearAdminSession()
  return json({ ok: true })
}
