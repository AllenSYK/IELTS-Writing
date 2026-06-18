import { clearAdminSession } from '@/lib/admin-auth'
import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
  await clearAdminSession()
  return json({ success: true })
}
