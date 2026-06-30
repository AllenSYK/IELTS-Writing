import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: wallet } = await service
    .from('study_plan_adjustment_wallets')
    .select('balance, lifetime_earned, lifetime_spent')
    .eq('user_id', userId)
    .maybeSingle()

  return json({
    success: true,
    balance: wallet?.balance ?? 0,
    lifetimeEarned: wallet?.lifetime_earned ?? 0,
    lifetimeSpent: wallet?.lifetime_spent ?? 0
  })
}
