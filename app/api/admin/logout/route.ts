import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
  return json({ success: true })
}
