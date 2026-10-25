import { z } from 'zod'

export const AdminSettingsSchema = z.object({
  defaultPlan: z.string().min(1).max(80),
  defaultDurationDays: z.number().int().min(1).max(3650),
  defaultMaxActivations: z.number().int().min(1).max(100),
  expiringReminderDays: z.number().int().min(1).max(365),
  pageSize: z.number().int().min(10).max(200),
  dateFormat: z.string().min(1).max(30),
  timezone: z.string().min(1).max(80).refine((timezone) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
      return true
    } catch {
      return false
    }
  }, { message: '无效的时区，请使用 IANA 时区格式（如 Asia/Shanghai）' }),
  // PostgreSQL returns offsets and microseconds. Keep the exact value for the
  // atomic equality check; converting to Date would lose sub-millisecond precision.
  expectedUpdatedAt: z.string().datetime({ offset: true, message: '更新时间格式无效，请刷新设置后重试。' }).optional()
})
