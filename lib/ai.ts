export {
  AiConfigurationError,
  AiProviderError,
  AiResponseError,
  apiStatusForAiError
} from '@/lib/ai-provider'
export {
  evaluateEssayWithAi,
  getEvaluationCacheKey,
  officialTaskRubric,
  parseAiEvaluationText,
  type AiScoringResult,
  type EssayEvaluationInput
} from '@/lib/ielts-evaluation'
export {
  buildCorrectedEssay,
  dedupeAndSortAnnotations,
  locateAnnotationInBlock as locateBlockAnnotation,
  selectApplicableCorrections,
  splitEssayIntoBlocks,
  type EssayTextBlock
} from '@/lib/essay-annotations'
export {
  generateWritingPromptWithAi,
  type PromptGenerationInput,
  type PromptHistorySummary
} from '@/lib/writing-prompt-generation'
