import { convertVisualDataToSpecs } from '@/lib/task1-chart-schema'

export type PastPaperReadinessSource = {
  taskType: string
  questionText: string
  task1VisualTypes?: string[] | null
  task1VisualData?: Record<string, unknown> | null
}

export type PastPaperReadiness = {
  ready: boolean
  code: 'READY' | 'QUESTION_TEXT_MISSING' | 'TASK1_VISUAL_MISSING' | 'TASK2_DIRECTIVE_MISSING' | 'UNSUPPORTED_TASK_TYPE'
  message: string
}

const task2DirectivePattern = /(?:\?|do you agree|to what extent|discuss (?:both|this|these)|give reasons|give your opinion|what (?:are|is|can|should|could|do|does)|why (?:is|are|do|does|has|have)|how (?:can|should|could|do|does)|advantages? (?:and|or) disadvantages?|benefits? (?:and|or) drawbacks?|causes? (?:and|or) solutions?|problems? (?:and|or) solutions?|positive or negative|agree or disagree|should (?:people|governments?|this|these|we)|what is your opinion|what are your views)/i

function hasRenderableTask1Visual(source: PastPaperReadinessSource) {
  if (!source.task1VisualData || !source.task1VisualTypes?.length) return false
  try {
    const specs = convertVisualDataToSpecs(
      source.task1VisualTypes,
      source.task1VisualData,
      'Task 1'
    )
    return Boolean(specs.chartSpec || specs.processSpec || specs.mapSpec)
  } catch {
    return false
  }
}

export function pastPaperPracticeReadiness(source: PastPaperReadinessSource): PastPaperReadiness {
  const questionText = source.questionText?.trim() ?? ''
  if (questionText.length < 20) {
    return {
      ready: false,
      code: 'QUESTION_TEXT_MISSING',
      message: '题干不完整，暂时不能发布到练习题库。'
    }
  }

  if (source.taskType === 'task1_academic') {
    if (!hasRenderableTask1Visual(source)) {
      return {
        ready: false,
        code: 'TASK1_VISUAL_MISSING',
        message: 'Task 1 Academic 必须包含可渲染的图表、地图或流程数据。'
      }
    }
    return { ready: true, code: 'READY', message: '题目可用于练习。' }
  }

  if (source.taskType === 'task1_general') {
    return { ready: true, code: 'READY', message: '题目可用于练习。' }
  }

  if (source.taskType === 'task2') {
    if (!task2DirectivePattern.test(questionText)) {
      return {
        ready: false,
        code: 'TASK2_DIRECTIVE_MISSING',
        message: 'Task 2 缺少明确的写作问题或作答指令。'
      }
    }
    return { ready: true, code: 'READY', message: '题目可用于练习。' }
  }

  return {
    ready: false,
    code: 'UNSUPPORTED_TASK_TYPE',
    message: '该记录不能直接作为单项写作练习。'
  }
}
