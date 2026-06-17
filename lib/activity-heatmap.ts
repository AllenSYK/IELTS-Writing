import { getWritingRecordDedupKeys, type WritingRecord } from '@/lib/writing-records'

const DayMs = 24 * 60 * 60 * 1000

export type ActivityDay = {
  date: string
  total: number
  task1: number
  task2: number
  mock: number
  level: number
  inRange: boolean
}

export type ActivityHeatmapData = {
  days: ActivityDay[]
  monthLabels: Array<{ label: string; weekIndex: number }>
  weekCount: number
  total: number
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(date)
}

function levelFor(total: number) {
  if (total <= 0) return 0
  if (total === 1) return 1
  if (total === 2) return 2
  if (total === 3) return 3
  return 4
}

function hasTask(record: WritingRecord, taskType: 'task1' | 'task2') {
  return record.taskType === taskType || Boolean(record.components?.[taskType])
}

export function buildActivityHeatmap(records: WritingRecord[], months = 12, now = new Date()): ActivityHeatmapData {
  const end = startOfDay(now)
  const dayCount = Math.max(1, Math.round((Math.max(1, months) / 12) * 365))
  const rangeStart = startOfDay(new Date(end.getTime() - (dayCount - 1) * DayMs))

  const gridStart = new Date(rangeStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  const dayBuckets = new Map<string, ActivityDay>()
  const seenRecords = new Set<string>()

  for (const record of records) {
    const keys = getWritingRecordDedupKeys(record)
    if (keys.some((key) => seenRecords.has(key))) continue
    keys.forEach((key) => seenRecords.add(key))

    const submitted = startOfDay(new Date(record.submittedAt))
    if (!Number.isFinite(submitted.getTime()) || submitted < rangeStart || submitted > end) continue

    const key = dateKey(submitted)
    const current = dayBuckets.get(key) ?? {
      date: key,
      total: 0,
      task1: 0,
      task2: 0,
      mock: 0,
      level: 0,
      inRange: true
    }
    current.total += 1
    if (hasTask(record, 'task1')) current.task1 += 1
    if (hasTask(record, 'task2')) current.task2 += 1
    if (record.taskType === 'mock') current.mock += 1
    current.level = levelFor(current.total)
    dayBuckets.set(key, current)
  }

  const days: ActivityDay[] = []
  const monthLabels: ActivityHeatmapData['monthLabels'] = []
  let cursor = new Date(gridStart)
  let lastMonth = -1
  let index = 0

  while (cursor <= end) {
    const key = dateKey(cursor)
    const inRange = cursor >= rangeStart && cursor <= end
    const bucket = dayBuckets.get(key)
    days.push(bucket ? { ...bucket, inRange } : { date: key, total: 0, task1: 0, task2: 0, mock: 0, level: 0, inRange })

    if (inRange && cursor.getMonth() !== lastMonth) {
      monthLabels.push({ label: monthLabel(cursor), weekIndex: Math.floor(index / 7) + 1 })
      lastMonth = cursor.getMonth()
    }

    cursor = new Date(cursor.getTime() + DayMs)
    index += 1
  }

  const weekCount = Math.ceil(days.length / 7)
  const total = [...dayBuckets.values()].reduce((sum, day) => sum + day.total, 0)

  return { days, monthLabels, weekCount, total }
}

export function activityTooltip(day: ActivityDay) {
  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(`${day.date}T00:00:00`))
  return `${date}：完成 ${day.total} 次；Task 1 ${day.task1} 次；Task 2 ${day.task2} 次`
}
