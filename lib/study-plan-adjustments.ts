export const MonthlyStudyPlanAdjustmentLimit = 3
export const StudyPlanAdjustmentTimeZone = 'Asia/Shanghai'

function datePartsInTimeZone(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: StudyPlanAdjustmentTimeZone,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return {
    year: Number(part('year')),
    month: Number(part('month'))
  }
}

export function studyPlanAdjustmentMonthRange(now = new Date()) {
  const { year, month } = datePartsInTimeZone(now)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const monthString = String(month).padStart(2, '0')
  const nextMonthString = String(nextMonth).padStart(2, '0')

  return {
    monthKey: `${year}-${monthString}`,
    startsAt: `${year}-${monthString}-01T00:00:00+08:00`,
    endsAt: `${nextYear}-${nextMonthString}-01T00:00:00+08:00`,
    limit: MonthlyStudyPlanAdjustmentLimit
  }
}

export function studyPlanAdjustmentQuota(usedCount: number, now = new Date()) {
  const range = studyPlanAdjustmentMonthRange(now)
  const used = Math.max(0, Math.floor(usedCount))
  return {
    monthKey: range.monthKey,
    usedCount: used,
    remainingCount: Math.max(0, range.limit - used),
    limit: range.limit
  }
}
