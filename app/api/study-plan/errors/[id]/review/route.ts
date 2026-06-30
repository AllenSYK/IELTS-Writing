import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const ReviewSchema = z.object({
  reviewType: z.enum(['rewrite', 'fill_blank', 'identify', 'explain', 'multiple_choice']).optional().default('rewrite'),
  result: z.enum(['correct', 'partial', 'incorrect', 'attempted']),
  score: z.number().min(0).max(1).optional()
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  let body
  try {
    body = ReviewSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: pattern, error: patternError } = await service
    .from('writing_error_patterns')
    .select('id, mastery_level, status, occurrence_count')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (patternError || !pattern) {
    return json({ success: false, message: 'Error pattern not found' }, { status: 404 })
  }

  await service
    .from('writing_error_reviews')
    .insert({
      error_pattern_id: id,
      user_id: userId,
      review_type: body.reviewType,
      result: body.result,
      score: body.score ?? null
    })

  const currentMastery = (pattern.mastery_level as number) ?? 0
  let masteryDelta = 0
  if (body.result === 'correct') masteryDelta = 0.15
  else if (body.result === 'partial') masteryDelta = 0.05
  else if (body.result === 'incorrect') masteryDelta = -0.1

  const newMastery = Math.max(0, Math.min(1, currentMastery + masteryDelta))

  let newStatus = pattern.status as string
  if (newMastery >= 0.85) newStatus = 'mastered'
  else if (newMastery >= 0.5) newStatus = 'improving'
  else newStatus = 'active'

  await service
    .from('writing_error_patterns')
    .update({
      mastery_level: newMastery,
      status: newStatus,
      last_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  return json({
    success: true,
    masteryLevel: newMastery,
    status: newStatus
  })
}
