import { ErrorCategoryLabels, type ErrorCategory } from './error-notebook-types'
import type { WritingRecord, EssayAnnotation, SentenceError } from './writing-record-types'

export type ExtractedError = {
  category: ErrorCategory
  title: string
  description: string
  exampleWrong: string | null
  exampleCorrect: string | null
  sentenceExcerpt: string | null
  explanation: string | null
}

const CategoryMapping: Record<string, ErrorCategory> = {
  'article': 'article',
  'articles': 'article',
  '冠词': 'article',
  'tense': 'tense',
  'tenses': 'tense',
  '时态': 'tense',
  'subject_verb_agreement': 'subject_verb_agreement',
  '主谓一致': 'subject_verb_agreement',
  'singular_plural': 'singular_plural',
  '单复数': 'singular_plural',
  'preposition': 'preposition',
  'prepositions': 'preposition',
  '介词': 'preposition',
  'sentence_structure': 'sentence_structure',
  'sentence-structure': 'sentence_structure',
  '句子结构': 'sentence_structure',
  'punctuation': 'punctuation',
  '标点': 'punctuation',
  'spelling': 'spelling',
  '拼写': 'spelling',
  'word_choice': 'word_choice',
  'vocabulary': 'word_choice',
  'style': 'word_choice',
  'repetition': 'word_choice',
  '用词': 'word_choice',
  'collocation': 'collocation',
  '搭配': 'collocation',
  'cohesion': 'cohesion',
  'coherence': 'cohesion',
  'unclear_expression': 'cohesion',
  '衔接': 'cohesion',
  'task_response': 'task_response',
  'task-response': 'task_response',
  'task_achievement': 'task_response',
  '任务回应': 'task_response',
  'idea_development': 'idea_development',
  '论证展开': 'idea_development',
  'overview': 'overview',
  '概述': 'overview',
  'data_comparison': 'data_comparison',
  '数据比较': 'data_comparison',
  'map_tense': 'map_tense',
  '地图时态': 'map_tense',
  'process_sequence': 'process_sequence',
  '流程顺序': 'process_sequence',
  'grammar': 'sentence_structure',
  'lexical': 'word_choice',
  'task': 'task_response',
  'other': 'other'
}

export function normalizeErrorCategory(raw: string): ErrorCategory {
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, '_')
  return CategoryMapping[key] ?? 'other'
}

function normalizedText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 180)
}

export function buildNormalizedKey(
  category: ErrorCategory,
  title: string,
  exampleWrong?: string | null,
  exampleCorrect?: string | null
): string {
  const contentKey = [normalizedText(exampleWrong), normalizedText(exampleCorrect)]
    .filter(Boolean)
    .join('=>')
  return `${category}:${contentKey || normalizedText(title) || 'unknown'}`
}

function extractFromAnnotation(ann: EssayAnnotation): ExtractedError | null {
  const category = normalizeErrorCategory(ann.category)
  const title = ErrorCategoryLabels[category]
  const excerpt = ann.originalText ? truncateExcerpt(ann.originalText) : null
  return {
    category,
    title,
    description: ann.explanationZh || ann.suggestion || '',
    exampleWrong: ann.originalText || null,
    exampleCorrect: ann.replacement || null,
    sentenceExcerpt: excerpt,
    explanation: ann.explanationZh || ann.suggestion || null
  }
}

function extractFromSentenceError(err: SentenceError): ExtractedError | null {
  const category = normalizeErrorCategory(err.category)
  const title = err.errorType || err.category || '未知错误'
  return {
    category,
    title,
    description: err.explanation || '',
    exampleWrong: err.original || null,
    exampleCorrect: err.correction || null,
    sentenceExcerpt: truncateExcerpt(err.original || ''),
    explanation: err.explanation || null
  }
}

export function extractErrorsFromRecord(record: WritingRecord): ExtractedError[] {
  const errors: ExtractedError[] = []
  const seen = new Set<string>()

  const eval_ = record.evaluation

  if (eval_?.annotations && Array.isArray(eval_.annotations)) {
    for (const ann of eval_.annotations) {
      const extracted = extractFromAnnotation(ann)
      if (!extracted) continue
      const key = buildNormalizedKey(extracted.category, extracted.title, extracted.exampleWrong, extracted.exampleCorrect)
      if (seen.has(key)) continue
      seen.add(key)
      errors.push(extracted)
    }
  }

  if (eval_?.sentenceErrors && Array.isArray(eval_.sentenceErrors)) {
    for (const err of eval_.sentenceErrors) {
      const extracted = extractFromSentenceError(err)
      if (!extracted) continue
      const key = buildNormalizedKey(extracted.category, extracted.title, extracted.exampleWrong, extracted.exampleCorrect)
      if (seen.has(key)) continue
      seen.add(key)
      errors.push(extracted)
    }
  }

  if (eval_?.sentenceAnnotations && Array.isArray(eval_.sentenceAnnotations)) {
    for (const err of eval_.sentenceAnnotations) {
      const extracted = extractFromSentenceError(err)
      if (!extracted) continue
      const key = buildNormalizedKey(extracted.category, extracted.title, extracted.exampleWrong, extracted.exampleCorrect)
      if (seen.has(key)) continue
      seen.add(key)
      errors.push(extracted)
    }
  }

  return errors.slice(0, 20)
}

function truncateExcerpt(text: string, maxLen = 200): string | null {
  if (!text) return null
  const clean = text.trim()
  if (clean.length <= maxLen) return clean
  return clean.slice(0, maxLen) + '…'
}
