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
