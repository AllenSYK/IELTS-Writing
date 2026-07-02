import { z } from 'zod'
import {
  EssayAnnotationCategories,
  EssayAnnotationSeverities,
  EssayScoreCriteria
} from '@/lib/writing-record-types'

export const AnnotationCategorySchema = z.enum(EssayAnnotationCategories)
export const AnnotationSeveritySchema = z.enum(EssayAnnotationSeverities)
export const AnnotationCriterionSchema = z.enum(EssayScoreCriteria)

export const BlockAnnotationDraftSchema = z.object({
  blockId: z.string().min(1),
  originalText: z.string().trim().min(1),
  occurrence: z.coerce.number().int().min(1).default(1),
  replacement: z.string().trim().min(1).optional(),
  category: AnnotationCategorySchema,
  severity: AnnotationSeveritySchema,
  scoreCriterion: AnnotationCriterionSchema,
  explanationZh: z.string().trim().min(1),
  explanationEn: z.string().trim().min(1).optional(),
  impactOnScore: z.string().trim().min(1),
  suggestion: z.string().trim().min(1)
})

export const BlockAnnotationResponseSchema = z.object({
  blockId: z.string().min(1),
  annotations: z.array(BlockAnnotationDraftSchema).default([]),
  checkedWholeBlock: z.literal(true)
})

export type BlockAnnotationDraft = Omit<z.infer<typeof BlockAnnotationDraftSchema>, 'blockId'> & {
  blockId?: string
}

export function normalizeAnnotationBlockResponse(raw: unknown): unknown {
  if (typeof raw === 'string') {
    let text = raw.trim()
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    try {
      return JSON.parse(text)
    } catch {
      return raw
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.annotations)) {
      return {
        blockId: obj.blockId ?? obj.block_id ?? '',
        annotations: obj.annotations.map((a: unknown) => {
          if (typeof a !== 'object' || a === null) return a
          const ann = a as Record<string, unknown>
          return {
            blockId: ann.blockId ?? ann.block_id ?? obj.blockId ?? '',
            originalText: ann.originalText ?? ann.original ?? ann.text ?? '',
            occurrence: ann.occurrence ?? 1,
            replacement: ann.replacement ?? ann.correction ?? ann.suggestion,
            category: ann.category ?? 'grammar',
            severity: ann.severity ?? 'medium',
            scoreCriterion: ann.scoreCriterion ?? ann.score_criterion ?? 'Grammatical Range and Accuracy',
            explanationZh: ann.explanationZh ?? ann.explanation_zh ?? ann.explanation ?? '',
            explanationEn: ann.explanationEn ?? ann.explanation_en ?? '',
            impactOnScore: ann.impactOnScore ?? ann.impact_on_score ?? '',
            suggestion: ann.suggestion ?? ann.replacement ?? ''
          }
        }),
        checkedWholeBlock: obj.checkedWholeBlock ?? true
      }
    }
  }
  return raw
}

export function validateBlockAnnotationResponse(
  value: unknown,
  block: { id?: string; text: string }
) {
  const blockId = block.id || ''
  const parsed = BlockAnnotationResponseSchema.safeParse(value)
  if (!parsed.success) {
    return {
      success: false as const,
      details: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
        .join('; ')
    }
  }

  if (parsed.data.blockId !== blockId) {
    return {
      success: false as const,
      details: `blockId: expected ${blockId}, received ${parsed.data.blockId}`
    }
  }

  const invalid = parsed.data.annotations.find((annotation) => (
    annotation.blockId !== blockId ||
    !block.text.includes(annotation.originalText)
  ))
  if (invalid) {
    return {
      success: false as const,
    details: invalid.blockId !== blockId
        ? `annotations.blockId: expected ${blockId}`
        : `annotations.originalText: "${invalid.originalText}" was not found in the current block`
    }
  }

  return { success: true as const, data: parsed.data }
}
