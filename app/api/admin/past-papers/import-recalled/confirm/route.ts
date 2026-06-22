import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { ExamMode, ExamSession } from '@/lib/past-paper-types'

const ConfirmSchema = z.object({
  batchId: z.string().uuid().nullable().optional(),
  records: z.array(z.object({
    examDate: z.string().nullable().optional(),
    examSession: z.enum(['morning', 'afternoon', 'evening', 'unknown']).default('unknown'),
    examTimeLocal: z.string().nullable().optional(),
    examMode: z.enum(['computer', 'paper', 'unknown']).default('unknown'),
    examCountry: z.string().nullable().optional(),
    examRegion: z.string().nullable().optional(),
    examCity: z.string().nullable().optional(),
    reliability: z.enum(['confirmed', 'multiple_reports', 'single_report', 'uncertain']).default('single_report'),
    task1: z.object({
      questionText: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      visualTypes: z.array(z.string()).default([]),
      completeness: z.enum(['complete', 'mostly_complete', 'partial', 'summary_only', 'missing']).default('partial'),
      topics: z.array(z.string()).default([]),
      missingFields: z.array(z.string()).default([]),
      uncertainties: z.array(z.string()).default([])
    }).nullable().optional(),
    task2: z.object({
      questionText: z.string().nullable().optional(),
      questionType: z.string().default('unknown'),
      primaryTopic: z.string().nullable().optional(),
      secondaryTopics: z.array(z.string()).default([]),
      completeness: z.enum(['complete', 'mostly_complete', 'partial', 'summary_only', 'missing']).default('complete'),
      missingFields: z.array(z.string()).default([]),
      uncertainties: z.array(z.string()).default([])
    }).nullable().optional()
  })).min(1).max(100),
  defaultYear: z.number().int().min(2020).max(2030).optional(),
  status: z.enum(['draft', 'review_pending']).default('draft')
})

export async function POST(request: Request) {
  let adminUser
  try {
    const admin = await requireWebAdmin()
    adminUser = admin.user
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = ConfirmSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const results: Array<{ setId: string; questionIds: string[] }> = []

  for (const record of body.records) {
    const examDate = resolveExamDate(record.examDate, body.defaultYear)
    const examSession: ExamSession = record.examSession ?? 'unknown'
    const examMode: ExamMode = record.examMode ?? 'unknown'

    const { data: set, error: setError } = await service
      .from('exam_writing_sets')
      .insert({
        exam_date: examDate,
        exam_session: examSession,
        exam_time_local: record.examTimeLocal ?? null,
        exam_timezone: null,
        exam_mode: examMode,
        exam_country: record.examCountry ?? null,
        exam_region: record.examRegion ?? null,
        exam_city: record.examCity ?? null,
        venue_note: null,
        source_type: 'recalled',
        source_reference: null,
        reliability: record.reliability ?? 'single_report',
        status: body.status,
        created_by: adminUser.id
      })
      .select('id')
      .single()

    if (setError || !set) continue

    const questionIds: string[] = []

    if (record.task1) {
      const t1 = record.task1
      const title = buildTask1Title(t1)
      const { data: q1 } = await service
        .from('past_paper_questions')
        .insert({
          status: body.status,
          task_type: 'task1_academic',
          title,
          question_text: t1.questionText ?? '',
          summary: t1.summary ?? '',
          source_type: 'recalled',
          source_year: extractYear(examDate),
          frequency_level: 'normal',
          frequency_source: 'admin',
          topics: t1.topics ?? [],
          keywords: [],
          task1_visual_types: t1.visualTypes ?? [],
          completeness: t1.completeness ?? 'partial',
          missing_fields: t1.missingFields ?? [],
          uncertainties: t1.uncertainties ?? [],
          exam_writing_set_id: set.id,
          exam_date: examDate,
          exam_session: examSession,
          exam_time_local: record.examTimeLocal ?? null,
          exam_mode: examMode,
          exam_country: record.examCountry ?? null,
          exam_region: record.examRegion ?? null,
          exam_city: record.examCity ?? null,
          created_by: adminUser.id
        })
        .select('id')
        .single()

      if (q1) questionIds.push(q1.id)
    }

    if (record.task2) {
      const t2 = record.task2
      const title = buildTask2Title(t2)
      const { data: q2 } = await service
        .from('past_paper_questions')
        .insert({
          status: body.status,
          task_type: 'task2',
          title,
          question_text: t2.questionText ?? '',
          summary: t2.questionText ? t2.questionText.slice(0, 200) : '',
          source_type: 'recalled',
          source_year: extractYear(examDate),
          frequency_level: 'normal',
          frequency_source: 'admin',
          task2_question_type: t2.questionType ?? 'unknown',
          topics: t2.primaryTopic ? [t2.primaryTopic, ...t2.secondaryTopics] : t2.secondaryTopics,
          keywords: [],
          primary_topic: t2.primaryTopic ?? null,
          secondary_topics: t2.secondaryTopics ?? [],
          completeness: t2.completeness ?? 'complete',
          missing_fields: t2.missingFields ?? [],
          uncertainties: t2.uncertainties ?? [],
          exam_writing_set_id: set.id,
          exam_date: examDate,
          exam_session: examSession,
          exam_time_local: record.examTimeLocal ?? null,
          exam_mode: examMode,
          exam_country: record.examCountry ?? null,
          exam_region: record.examRegion ?? null,
          exam_city: record.examCity ?? null,
          created_by: adminUser.id
        })
        .select('id')
        .single()

      if (q2) questionIds.push(q2.id)
    }

    results.push({ setId: set.id, questionIds })
  }

  return json({
    success: true,
    setsCreated: results.length,
    questionsCreated: results.reduce((sum, r) => sum + r.questionIds.length, 0),
    results
  })
}

function resolveExamDate(dateStr: string | null | undefined, defaultYear?: number): string | null {
  if (!dateStr) return null
  const parts = dateStr.split('-')
  if (parts.length === 3) return dateStr
  if (parts.length === 2 && defaultYear) {
    return `${defaultYear}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }
  return null
}

function extractYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})/)
  return match ? Number(match[1]) : null
}

function buildTask1Title(t1: { summary?: string | null; visualTypes?: string[]; completeness?: string }): string {
  const visualLabel = t1.visualTypes?.length
    ? t1.visualTypes.map(v => {
        const labels: Record<string, string> = { line: '折线图', bar: '柱状图', pie: '饼图', table: '表格', map: '地图', process: '流程图', mixed: '组合图', letter: '书信' }
        return labels[v] ?? v
      }).join('+')
    : 'Task 1'
  const summaryPart = t1.summary ? ` - ${t1.summary.slice(0, 60)}` : ''
  return `${visualLabel}${summaryPart}`.slice(0, 200) || 'Task 1'
}

function buildTask2Title(t2: { questionText?: string | null; primaryTopic?: string | null }): string {
  if (t2.questionText) return t2.questionText.slice(0, 200)
  if (t2.primaryTopic) return `Task 2 - ${t2.primaryTopic}`
  return 'Task 2'
}
