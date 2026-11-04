import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { billingScope, hasPaidSubscriptionAccess, hasTrialSubscriptionAccess } from '@/lib/billing/config'
import { loadAdminBillingCounts, SUBSCRIPTION_COLUMNS, PAYMENT_COLUMNS, TRIAL_COLUMNS } from '@/lib/admin/membership-data'
import type { AdminPayment, AdminSubscription, AdminTrial } from '@/lib/admin/membership'

const Query = z.object({
  type: z.enum(['subscriptions', 'payments', 'trials']).default('subscriptions'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  userId: z.string().uuid().optional()
})

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const parsed = Query.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) return json({ success: false, message: '查询参数无效。' }, { status: 400 })
    const { type, page, userId } = parsed.data
    const scope = billingScope()
    const stats = await loadAdminBillingCounts(service)
    if (!scope) return json({ success: true, stats, records: [], total: 0, pageSize: 20 })
    const config = {
      subscriptions: { table: 'stripe_billing_subscriptions', columns: SUBSCRIPTION_COLUMNS, date: 'created_at', id: 'stripe_subscription_id' },
      payments: { table: 'stripe_billing_payments', columns: PAYMENT_COLUMNS, date: 'paid_at', id: 'checkout_session_id' },
      trials: { table: 'stripe_billing_trials', columns: TRIAL_COLUMNS, date: 'reserved_at', id: 'user_id' }
    }[type]
    let query = service.from(config.table).select(config.columns, { count: 'exact' })
      .eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
      .order(config.date, { ascending: false }).order(config.id)
    if (userId) query = query.eq('user_id', userId)
    const { data, error, count } = await query.range((page - 1) * 20, page * 20 - 1)
    if (error) throw error
    const rows = (data || []) as unknown as Array<AdminSubscription & AdminPayment & AdminTrial>
    const ids = [...new Set(rows.map((row) => row.user_id))]
    const profiles = ids.length ? await service.from('profiles').select('id, email, phone, license_status, role').in('id', ids) : { data: [], error: null }
    if (profiles.error) throw profiles.error
    const profileMap = new Map((profiles.data || []).map((profile) => [profile.id, profile]))
    const now = Date.now()
    const records = rows.map((row) => {
      const profile = profileMap.get(row.user_id)
      const active = type === 'subscriptions' ? hasPaidSubscriptionAccess(row, now) || hasTrialSubscriptionAccess(row, now)
        : type === 'payments' ? !row.risk_hold && Date.parse(row.expires_at) > now : false
      const expiresAt = type === 'subscriptions' ? row.status === 'trialing' ? row.trial_end : row.paid_through
        : type === 'payments' ? row.expires_at : null
      return {
        id: type === 'subscriptions' ? row.stripe_subscription_id : type === 'payments' ? row.checkout_session_id : row.user_id,
        userId: row.user_id, account: profile?.email || profile?.phone || row.user_id,
        status: row.risk_hold ? 'suspended' : type === 'trials' ? row.stripe_subscription_id ? 'claimed' : 'reserved'
          : type === 'payments' ? active ? 'active' : 'expired' : row.status,
        accessActive: active && Boolean(profile) && profile!.license_status !== 'suspended' && profile!.role !== 'admin',
        accountSuspended: profile?.license_status === 'suspended',
        offer: type === 'trials' ? row.offer : row.trial_offer || null,
        expiresAt, createdAt: type === 'subscriptions' ? row.created_at : type === 'payments' ? row.paid_at : row.reserved_at,
        autoRenew: type === 'subscriptions' && ['active', 'past_due', 'trialing'].includes(row.status)
          && !row.cancel_at_period_end && !(row.status === 'trialing' && row.trial_offer === 'no_card'),
        amount: type === 'payments' ? row.amount : null, currency: type === 'payments' ? row.currency : null,
        observedAt: type === 'subscriptions' ? row.observed_at : null,
        subscriptionId: type === 'trials' ? row.stripe_subscription_id : null
      }
    })
    return json({ success: true, stats, records, total: count || 0, pageSize: 20 })
  } catch (error) {
    return adminApiError(error, '无法加载会员记录')
  }
}
