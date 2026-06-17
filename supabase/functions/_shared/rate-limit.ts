import { getServiceClient } from './supabase.ts'
import { sha256Hex } from './crypto.ts'

export async function checkRateLimit(bucket: string, subject: string, limit: number, windowSeconds: number) {
  const supabase = getServiceClient()
  const subjectHash = await sha256Hex(subject)
  const now = new Date()
  const { data } = await supabase
    .from('license_rate_limits')
    .select('*')
    .eq('bucket', bucket)
    .eq('subject_hash', subjectHash)
    .maybeSingle()

  if (!data) {
    await supabase.from('license_rate_limits').insert({
      bucket,
      subject_hash: subjectHash,
      count: 1,
      window_started_at: now.toISOString()
    })
    return { allowed: true }
  }

  const started = new Date(data.window_started_at).getTime()
  const reset = now.getTime() - started > windowSeconds * 1000
  if (reset) {
    await supabase
      .from('license_rate_limits')
      .update({ count: 1, window_started_at: now.toISOString() })
      .eq('id', data.id)
    return { allowed: true }
  }

  if (data.count >= limit) {
    return { allowed: false }
  }

  await supabase.from('license_rate_limits').update({ count: data.count + 1 }).eq('id', data.id)
  return { allowed: true }
}
