export type WritingActivityDay = {
  date: string
  count: number
}

type UsageTimestamp = {
  created_at: string
}

export const WritingActivityTimeZone = 'Asia/Shanghai'
export const WritingActivityDays = 365

function dateKeyInTimeZone(value: string | Date, timeZone = WritingActivityTimeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(typeof value === 'string' ? new Date(value) : value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function addUtcDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function buildWritingActivity(
  rows: UsageTimestamp[],
  options: { today?: Date; days?: number; timeZone?: string } = {}
) {
  const days = options.days ?? WritingActivityDays
  const timeZone = options.timeZone ?? WritingActivityTimeZone
  const todayKey = dateKeyInTimeZone(options.today ?? new Date(), timeZone)
  const startKey = addUtcDays(todayKey, -(days - 1))
  const counts = new Map<string, number>()

  for (const row of rows) {
    const key = dateKeyInTimeZone(row.created_at, timeZone)
    if (key < startKey || key > todayKey) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from({ length: days }, (_, index) => {
    const date = addUtcDays(startKey, index)
    return { date, count: counts.get(date) ?? 0 }
  })
}

export async function loadWritingActivityForUser(
  userId: string,
  today = new Date(),
  days = WritingActivityDays
) {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/server')
  const service = createSupabaseServiceRoleClient()
  const todayKey = dateKeyInTimeZone(today)
  const startKey = addUtcDays(todayKey, -(days - 1))
  const queryStart = `${startKey}T00:00:00+08:00`
  const queryEnd = `${addUtcDays(todayKey, 1)}T00:00:00+08:00`

  const rows: UsageTimestamp[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await service
      .from('usage_records')
      .select('created_at')
      .eq('user_id', userId)
      .eq('action', 'evaluate')
      .eq('success', true)
      .gte('created_at', queryStart)
      .lt('created_at', queryEnd)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const page = (data ?? []) as UsageTimestamp[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return buildWritingActivity(rows, { today, days })
}
