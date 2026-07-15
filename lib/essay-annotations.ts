import type {
  AcceptedAnnotationChange,
  EssayAnnotation,
  EssayAnnotationSeverity,
  EssayScoreCriterion,
  WritingTaskType
} from '@/lib/writing-record-types'
import type { BlockAnnotationDraft } from '@/lib/essay-annotation-schema'

export const AnnotationVersion = 2

const MAX_ANNOTATION_BLOCK_CHARS = 2_500

const AnnotationSeverityRank: Record<EssayAnnotationSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1
}

export type EssayTextBlock = {
  id?: string
  index: number
  text: string
  baseOffset: number
}

function annotationHash(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function isResolvedAnnotation(annotation: EssayAnnotation, essay: string) {
  return (
    !annotation.unresolved &&
    annotation.start >= 0 &&
    annotation.end > annotation.start &&
    annotation.end <= essay.length &&
    essay.slice(annotation.start, annotation.end) === annotation.originalText
  )
}

function splitLongBlock(text: string, baseOffset: number) {
  const blocks: Array<{ text: string; baseOffset: number }> = []
  let localOffset = 0

  while (text.length - localOffset > MAX_ANNOTATION_BLOCK_CHARS) {
    const limit = localOffset + MAX_ANNOTATION_BLOCK_CHARS
    const searchStart = localOffset + Math.floor(MAX_ANNOTATION_BLOCK_CHARS * 0.55)
    const boundaryWindow = text.slice(searchStart, limit)
    const boundaryMatches = [...boundaryWindow.matchAll(/[.!?](?:["')\]]+)?\s+|\n+/g)]
    const lastBoundary = boundaryMatches.at(-1)
    const boundary = lastBoundary
      ? searchStart + (lastBoundary.index ?? 0) + lastBoundary[0].length
      : limit
    const end = Math.max(localOffset + 1, boundary)
    blocks.push({ text: text.slice(localOffset, end), baseOffset: baseOffset + localOffset })
    localOffset = end
  }

  if (localOffset < text.length) {
    blocks.push({ text: text.slice(localOffset), baseOffset: baseOffset + localOffset })
  }
  return blocks
}

export function splitEssayIntoBlocks(essay: string): EssayTextBlock[] {
  if (!essay) return []
  const paragraphs: Array<{ text: string; baseOffset: number }> = []
  const separator = /(?:\r?\n[ \t]*){2,}/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = separator.exec(essay)) !== null) {
    const end = match.index + match[0].length
    paragraphs.push({ text: essay.slice(cursor, end), baseOffset: cursor })
    cursor = end
  }
  if (cursor < essay.length) paragraphs.push({ text: essay.slice(cursor), baseOffset: cursor })
  if (paragraphs.length === 0) paragraphs.push({ text: essay, baseOffset: 0 })

  return paragraphs
    .flatMap((paragraph) =>
      paragraph.text.length > MAX_ANNOTATION_BLOCK_CHARS
        ? splitLongBlock(paragraph.text, paragraph.baseOffset)
        : [paragraph]
    )
    .map((block, index) => ({
      ...block,
      id: `block-${block.baseOffset}-${annotationHash(block.text).toString(36)}`,
      index
    }))
}

function findOccurrence(text: string, originalText: string, occurrence: number) {
  let localStart = -1
  let searchFrom = 0
  for (let index = 0; index < occurrence; index += 1) {
    localStart = text.indexOf(originalText, searchFrom)
    if (localStart === -1) return -1
    searchFrom = localStart + Math.max(1, originalText.length)
  }
  return localStart
}

export function criterionForTask(
  criterion: EssayScoreCriterion,
  taskType: Exclude<WritingTaskType, 'mock'>
): EssayScoreCriterion {
  if (criterion === 'Task Achievement' && taskType === 'task2') return 'Task Response'
  if (criterion === 'Task Response' && taskType === 'task1') return 'Task Achievement'
  return criterion
}

export function locateAnnotationInBlock(
  draft: BlockAnnotationDraft,
  block: EssayTextBlock,
  taskType: Exclude<WritingTaskType, 'mock'>
): EssayAnnotation {
  const occurrence = Math.max(1, draft.occurrence)
  const localStart = findOccurrence(block.text, draft.originalText, occurrence)
  const start = localStart === -1 ? -1 : block.baseOffset + localStart
  const end = start === -1 ? -1 : start + draft.originalText.length
  const unresolved = localStart === -1
  const stableKey = [
    unresolved ? block.id || `block-${block.index}` : `${start}:${end}`,
    draft.category,
    draft.originalText,
    draft.replacement || ''
  ].join('|')

  return {
    id: `ann-${annotationHash(stableKey)}`,
    start,
    end,
    originalText: draft.originalText,
    replacement: draft.replacement,
    category: draft.category,
    severity: draft.severity,
    scoreCriterion: criterionForTask(draft.scoreCriterion, taskType),
    explanationZh: draft.explanationZh,
    explanationEn: draft.explanationEn,
    impactOnScore: draft.impactOnScore,
    suggestion: draft.suggestion,
    unresolved,
    blockIndex: block.index,
    blockId: block.id || `block-${block.index}`
  }
}

function normalizedReplacement(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() || ''
}

export function compareAnnotationPriority(first: EssayAnnotation, second: EssayAnnotation) {
  const severity = AnnotationSeverityRank[second.severity] - AnnotationSeverityRank[first.severity]
  if (severity !== 0) return severity
  const length = (second.end - second.start) - (first.end - first.start)
  if (length !== 0) return length
  return first.start - second.start
}

export function annotationsOverlap(
  first: Pick<EssayAnnotation, 'start' | 'end'>,
  second: Pick<EssayAnnotation, 'start' | 'end'>
) {
  return first.start < second.end && second.start < first.end
}

export function selectCompatibleAnnotations(annotations: EssayAnnotation[]) {
  const selected: EssayAnnotation[] = []
  for (const annotation of annotations.slice().sort(compareAnnotationPriority)) {
    if (!selected.some((current) => annotationsOverlap(current, annotation))) {
      selected.push(annotation)
    }
  }
  return selected
}

export function dedupeAndSortAnnotations(annotations: EssayAnnotation[]) {
  const seen = new Set<string>()
  return annotations
    .filter((annotation) => {
      const key = annotation.unresolved
        ? `unresolved:${annotation.blockIndex ?? -1}:${annotation.originalText}:${annotation.category}:${normalizedReplacement(annotation.replacement)}`
        : `resolved:${annotation.start}:${annotation.end}:${annotation.category}:${normalizedReplacement(annotation.replacement)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((first, second) => {
      if (Boolean(first.unresolved) !== Boolean(second.unresolved)) return first.unresolved ? 1 : -1
      if (!first.unresolved && !second.unresolved) {
        if (first.start !== second.start) return first.start - second.start
        if (first.end !== second.end) return first.end - second.end
        const severity = AnnotationSeverityRank[second.severity] - AnnotationSeverityRank[first.severity]
        if (severity !== 0) return severity
      }
      return (first.blockIndex ?? 0) - (second.blockIndex ?? 0)
    })
}

export function selectApplicableCorrections(essay: string, annotations: EssayAnnotation[]) {
  return selectCompatibleAnnotations(
    annotations.filter((annotation) =>
      Boolean(annotation.replacement) && isResolvedAnnotation(annotation, essay)
    )
  )
}

export function buildCorrectedEssay(essay: string, annotations: EssayAnnotation[]) {
  return selectApplicableCorrections(essay, annotations)
    .sort((first, second) => second.start - first.start)
    .reduce(
      (text, annotation) => `${text.slice(0, annotation.start)}${annotation.replacement}${text.slice(annotation.end)}`,
      essay
    )
}

export function applyAcceptedAnnotationChanges(
  originalEssay: string,
  changes: AcceptedAnnotationChange[],
  annotations: EssayAnnotation[]
) {
  const annotationsById = new Map(annotations.map((annotation) => [annotation.id, annotation]))
  const validChanges = changes.filter((change) =>
    change.start >= 0 &&
    change.end > change.start &&
    originalEssay.slice(change.start, change.end) === change.originalText
  )
  const selected: AcceptedAnnotationChange[] = []

  validChanges.sort((first, second) => {
    const firstAnnotation = annotationsById.get(first.annotationId)
    const secondAnnotation = annotationsById.get(second.annotationId)
    const severity = AnnotationSeverityRank[secondAnnotation?.severity ?? 'medium']
      - AnnotationSeverityRank[firstAnnotation?.severity ?? 'medium']
    if (severity !== 0) return severity
    return (second.end - second.start) - (first.end - first.start) || first.start - second.start
  })

  for (const change of validChanges) {
    if (!selected.some((current) => current.start < change.end && change.start < current.end)) {
      selected.push(change)
    }
  }

  return selected
    .sort((first, second) => second.start - first.start)
    .reduce(
      (text, change) => `${text.slice(0, change.start)}${change.replacement}${text.slice(change.end)}`,
      originalEssay
    )
}

export function validateAnnotationIntegrity(
  annotations: EssayAnnotation[],
  essay: string,
  options: { minAnnotations?: number; allowEmpty?: boolean } = {}
): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  const { minAnnotations = 1, allowEmpty = false } = options

  if (!Array.isArray(annotations)) {
    issues.push('annotations is not an array')
    return { valid: false, issues }
  }

  if (annotations.length === 0 && !allowEmpty) {
    issues.push('annotations array is empty')
    return { valid: false, issues }
  }

  if (annotations.length < minAnnotations && !allowEmpty) {
    issues.push(`annotations count (${annotations.length}) is below minimum (${minAnnotations})`)
  }

  for (const annotation of annotations) {
    if (!annotation.id || typeof annotation.id !== 'string') {
      issues.push('annotation missing valid id')
    }

    if (typeof annotation.start !== 'number' || typeof annotation.end !== 'number') {
      issues.push(`annotation ${annotation.id} missing start/end`)
    } else if (annotation.start < 0 || annotation.end <= annotation.start) {
      issues.push(`annotation ${annotation.id} has invalid range: ${annotation.start}-${annotation.end}`)
    } else if (annotation.end > essay.length) {
      issues.push(`annotation ${annotation.id} end (${annotation.end}) exceeds essay length (${essay.length})`)
    }

    if (!annotation.category || typeof annotation.category !== 'string') {
      issues.push(`annotation ${annotation.id} missing category`)
    }

    if (!annotation.explanationZh || typeof annotation.explanationZh !== 'string') {
      issues.push(`annotation ${annotation.id} missing explanationZh`)
    }

    if (!annotation.originalText || typeof annotation.originalText !== 'string') {
      issues.push(`annotation ${annotation.id} missing originalText`)
    }

    if (annotation.blockId && typeof annotation.blockId === 'string') {
      if (annotation.blockId.includes('AI') || annotation.blockId.includes('错误') || annotation.blockId.includes('error')) {
        issues.push(`annotation ${annotation.id} has polluted blockId: ${annotation.blockId}`)
      }
    }
  }

  return { valid: issues.length === 0, issues }
}
