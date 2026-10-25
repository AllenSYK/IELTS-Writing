import { z } from 'zod'

export const SupportFeedbackLimits = { subject: 120, message: 5000 } as const

// Diagnostic metadata must never prevent a valid feedback message from being sent.
const diagnosticText = (limit: number, fallback: string) =>
  z.string().transform((value) => value.trim().slice(0, limit) || fallback).optional().default(fallback)

export const SupportFeedbackSchema = z.object({
  category: z.string().trim().min(1, '请选择问题类型。').max(60),
  subject: z.string().trim().min(2, '问题标题至少填写 2 个字。').max(SupportFeedbackLimits.subject, '问题标题最多填写 120 个字。'),
  message: z.string().trim().min(10, '问题描述至少填写 10 个字，请补充发生问题的步骤或错误提示。').max(SupportFeedbackLimits.message, '问题描述最多填写 5000 个字。'),
  contactEmail: z.string().trim().pipe(z.string().email('请输入有效的联系邮箱，或留空。').or(z.literal(''))).optional().default(''),
  includeDiagnostics: z.boolean().default(true),
  diagnostics: z.object({
    appVersion: diagnosticText(80, '未提供'),
    platform: diagnosticText(120, '未提供'),
    osVersion: diagnosticText(500, '未提供'),
    recentErrorCode: diagnosticText(160, '无')
  }).optional().default({})
}).transform((value) => ({
  ...value,
  diagnostics: value.includeDiagnostics ? value.diagnostics : undefined
}))

export type SupportFeedbackField = 'subject' | 'message' | 'contactEmail'
export type SupportFeedbackFieldErrors = Partial<Record<SupportFeedbackField, string>>

export function supportFeedbackFieldErrors(error: z.ZodError): SupportFeedbackFieldErrors {
  const fields = error.flatten().fieldErrors
  return {
    subject: fields.subject?.[0],
    message: fields.message?.[0],
    contactEmail: fields.contactEmail?.[0]
  }
}
