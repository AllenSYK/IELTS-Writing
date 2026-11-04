import { redirect } from 'next/navigation'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { BillingClient } from '@/components/billing/BillingClient'
import { loadWebLicenseAccessSnapshot } from '@/lib/web-license/access'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { membershipSummary } from '@/lib/billing/membership'
import { membershipDestination } from '@/lib/billing/navigation'

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; next?: string }> }) {
  const [user, params] = await Promise.all([getCurrentSupabaseUser(), searchParams])
  if (!user) redirect('/login?next=%2Fbilling')
  const snapshot = await loadWebLicenseAccessSnapshot(createSupabaseServiceRoleClient(), user.id)
  const profile = snapshot.profile
  if (profile?.role === 'admin') redirect('/admin')
  const membership = membershipSummary(snapshot)
  return <BillingClient userId={user.id} accountLabel={profile?.email || profile?.phone || user.email || '当前账号'} initialMembership={membership} checkoutResult={params.checkout} destination={membershipDestination(params.next)} />
}
