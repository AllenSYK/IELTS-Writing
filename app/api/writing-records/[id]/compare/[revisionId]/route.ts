import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { WritingRecordSelect, writingRecordFromRow } from '@/lib/writing-record-persistence'
import type { WritingRecord } from '@/lib/writing-record-types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id, revisionId } = await params
  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const [originalResult, revisionResult] = await Promise.all([
    service
      .from('writing_records')
      .select(WritingRecordSelect)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
    service
      .from('writing_records')
      .select(WritingRecordSelect)
      .eq('id', revisionId)
      .eq('user_id', userId)
      .maybeSingle()
  ])

  if (originalResult.error || !originalResult.data) {
    return json({ success: false, message: 'Original record not found' }, { status: 404 })
  }
  if (revisionResult.error || !revisionResult.data) {
    return json({ success: false, message: 'Revision record not found' }, { status: 404 })
  }

  const original = writingRecordFromRow(originalResult.data as never)
  const revision = writingRecordFromRow(revisionResult.data as never)

  if (!original || !revision) {
    return json({ success: false, message: 'Failed to parse records' }, { status: 500 })
  }

  const comparison = buildComparison(original, revision)

  return json({
    success: true,
    original: {
      id: original.id,
      title: original.title,
      essay: original.essay,
      evaluation: original.evaluation,
      submittedAt: original.submittedAt
    },
    revision: {
      id: revision.id,
      title: revision.title,
      essay: (revision as Record<string, unknown>).record_data
        ? ((revision as Record<string, unknown>).record_data as Record<string, unknown>).originalEssay || revision.essay
        : revision.essay,
      evaluation: revision.evaluation,
      submittedAt: revision.submittedAt,
      revisionNumber: (revision as Record<string, unknown>).revision_number ?? 2
    },
    comparison
  })
}

type ComparisonResult = {
  scoreDiff: number | null
  criteriaDiffs: Record<string, number | null>
  fixedIssues: string[]
  remainingIssues: string[]
  newIssues: string[]
}

function buildComparison(original: WritingRecord, revision: WritingRecord): ComparisonResult {
  const origEval = original.evaluation
  const revEval = revision.evaluation

  const origBand = parseBand(origEval?.overallBand)
  const revBand = parseBand(revEval?.overallBand)
  const scoreDiff = origBand !== null && revBand !== null ? Math.round((revBand - origBand) * 10) / 10 : null

  const criteriaDiffs: Record<string, number | null> = {}
  const criteriaKeys = ['taskAchievement', 'taskResponse', 'coherenceCohesion', 'lexicalResource', 'grammaticalRangeAccuracy'] as const
  for (const key of criteriaKeys) {
    const origScore = parseBand(origEval?.[key]?.score)
    const revScore = parseBand(revEval?.[key]?.score)
    criteriaDiffs[key] = origScore !== null && revScore !== null ? Math.round((revScore - origScore) * 10) / 10 : null
  }

  const origAnnotationCategories = new Set(
    (origEval?.annotations ?? []).map((a) => a.category)
  )
  const revAnnotationCategories = new Set(
    (revEval?.annotations ?? []).map((a) => a.category)
  )

  const fixedIssues: string[] = []
  const remainingIssues: string[] = []
  const newIssues: string[] = []

  for (const cat of origAnnotationCategories) {
    if (!revAnnotationCategories.has(cat)) {
      fixedIssues.push(cat)
    } else {
      remainingIssues.push(cat)
    }
  }
  for (const cat of revAnnotationCategories) {
    if (!origAnnotationCategories.has(cat)) {
      newIssues.push(cat)
    }
  }

  return { scoreDiff, criteriaDiffs, fixedIssues, remainingIssues, newIssues }
}

function parseBand(value: string | undefined | null): number | null {
  if (!value) return null
  const num = parseFloat(value)
  return isNaN(num) ? null : num
}
