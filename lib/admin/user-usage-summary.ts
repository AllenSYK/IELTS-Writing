export type UsageRecord = {
  user_id: string
  created_at: string
}

export type UserUsageSummary = {
  user_id: string
  evaluation_count: number
  last_used_at: string | null
}

export function summarizeUsageRecords(records: UsageRecord[]): UserUsageSummary[] {
  const summary = new Map<string, UserUsageSummary>()

  for (const record of records) {
    const current = summary.get(record.user_id)
    if (!current) {
      summary.set(record.user_id, {
        user_id: record.user_id,
        evaluation_count: 1,
        last_used_at: record.created_at
      })
      continue
    }

    current.evaluation_count += 1
    if (!current.last_used_at || record.created_at > current.last_used_at) {
      current.last_used_at = record.created_at
    }
  }

  return [...summary.values()]
}
