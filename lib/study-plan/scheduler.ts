import { addDaysToDateKey } from '@/lib/date-utils'

export function weekday(dateKey: string) {
  return new Date(dateKey + 'T00:00:00Z').getUTCDay()
}

export function daysBetween(start: string, end: string) {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000
}

/** Minimize squared gaps over the whole recurring week, including its boundary. */
export function selectLearningDays(sessionsPerWeek: number, preferredDays: number[] = []) {
  const explicit = [...new Set(preferredDays)].filter(day => Number.isInteger(day) && day >= 0 && day < 7)
  const count = Math.max(explicit.length, Math.min(7, Math.max(1, sessionsPerWeek)))
  let best: number[] = []
  let bestCost = Infinity
  // Monday-first enumeration makes tied schedules predictable.
  const orderedDays = [1, 2, 3, 4, 5, 6, 0]
  for (let mask = 1; mask < 128; mask++) {
    const days = orderedDays.filter((_, i) => mask & (1 << i))
    if (days.length !== count || !explicit.every(day => days.includes(day))) continue
    const offsets = days.map(day => (day + 6) % 7)
    const cost = offsets.reduce((sum, day, i) => sum + ((offsets[i + 1] ?? offsets[0] + 7) - day) ** 2, 0)
    if (cost < bestCost) {
      best = days
      bestCost = cost
    }
  }
  return best
}

export function scheduleLearningDays(start: string, end: string, sessions: number, preferred: number[], anchor = start) {
  const weekdays = selectLearningDays(sessions, preferred)
  const dates: Array<{ date: string; recovery: boolean }> = []
  // With seven selected days, a recovery day resets the workload cycle every four days.
  // Other schedules have a natural rest day within the previous week.
  const lookback = addDaysToDateKey(start, -7)
  const firstDate = weekdays.length === 7 ? start : lookback > anchor ? lookback : anchor
  let streak = weekdays.length === 7 ? Math.max(0, daysBetween(anchor, start)) % 4 : 0
  for (let date = firstDate; date <= end; date = addDaysToDateKey(date, 1)) {
    if (!weekdays.includes(weekday(date))) {
      streak = 0
      continue
    }
    const recovery = ++streak > 3
    if (date >= start) dates.push({ date, recovery })
    if (recovery) streak = 0
  }
  return dates
}
