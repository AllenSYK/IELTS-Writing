import { json } from '@/lib/http'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { loadBillingInvoices } from '@/lib/billing/invoices'
import { billingErrorResponse } from '@/lib/billing/stripe'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const user = await getCurrentSupabaseUser()
    if (!user) return json({ success: false, message: '请先登录。' }, { status: 401 })
    return json({ success: true, ...await loadBillingInvoices(createSupabaseServiceRoleClient(), user.id) })
  } catch (error) { return billingErrorResponse(error) }
}
