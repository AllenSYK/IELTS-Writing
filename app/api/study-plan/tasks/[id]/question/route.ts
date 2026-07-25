import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { pastPaperPracticeReadiness } from '@/lib/past-paper-readiness'

const questionFields = 'id, task_type, title, question_text, task1_visual_types, task1_visual_data, task2_question_type'

function questionIsReady(question: Record<string, unknown>, taskType: string) {
  const typeMatches =
    (taskType === 'task1' && question.task_type === 'task1_academic')
    || (taskType === 'task2' && question.task_type === 'task2')
  if (!typeMatches) return false
  return pastPaperPracticeReadiness({
    taskType: question.task_type as string,
    questionText: question.question_text as string,
    task1VisualTypes: question.task1_visual_types as string[] | null,
    task1VisualData: question.task1_visual_data as Record<string, unknown> | null
  }).ready
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()
  const { data: task, error: taskError } = await service
    .from('study_plan_tasks')
    .select('id, task_type, writing_mode, question_id, question_source')
    .eq('id', id)
    .eq('user_id', check.user.id)
    .maybeSingle()

  if (taskError || !task) {
    return json({ success: false, code: 'STUDY_PLAN_TASK_NOT_FOUND', message: '学习任务不存在。' }, { status: 404 })
  }

  if (task.question_source !== 'question_bank') {
    return json({
      success: true,
      task: {
        id: task.id,
        taskType: task.task_type,
        writingMode: task.writing_mode,
        questionId: task.question_id,
        questionSource: task.question_source
      },
      question: null
    })
  }

  if (task.task_type === 'full_test') {
    return json({
      success: false,
      code: 'STUDY_PLAN_FULL_TEST_QUESTION_PAIR_INCOMPLETE',
      message: '这个完整测试没有保存成对的 Task 1 和 Task 2 题目，请重新生成学习规划。'
    }, { status: 409 })
  }

  let question: Record<string, unknown> | null = null
  if (task.question_id) {
    const currentResult = await service
      .from('past_paper_questions')
      .select(questionFields)
      .eq('id', task.question_id)
      .eq('status', 'published')
      .eq('is_visible', true)
      .maybeSingle()
    const current = currentResult.data as Record<string, unknown> | null
    if (!currentResult.error && current && questionIsReady(current, task.task_type)) {
      question = current
    }
  }

  if (!question) {
    const expectedTaskType = task.task_type === 'task1' ? 'task1_academic' : 'task2'
    const [candidateResult, usedResult] = await Promise.all([
      service
        .from('past_paper_questions')
        .select(questionFields)
        .eq('status', 'published')
        .eq('is_visible', true)
        .eq('task_type', expectedTaskType)
        .order('published_at', { ascending: false })
        .limit(100),
      service
        .from('study_plan_tasks')
        .select('question_id')
        .eq('user_id', check.user.id)
        .not('question_id', 'is', null)
    ])

    if (candidateResult.error) {
      return json({
        success: false,
        code: 'STUDY_PLAN_QUESTION_ASSIGNMENT_FAILED',
        message: '暂时无法从后台题库分配题目，请稍后重试。'
      }, { status: 500 })
    }

    const usedQuestionIds = new Set(
      (usedResult.data ?? [])
        .map((row) => row.question_id)
        .filter((value): value is string => typeof value === 'string')
    )
    const candidates = ((candidateResult.data ?? []) as unknown as Record<string, unknown>[])
      .filter((item) => questionIsReady(item, task.task_type))
    question = candidates.find((item) => !usedQuestionIds.has(item.id as string)) ?? candidates[0] ?? null

    if (!question) {
      return json({
        success: false,
        code: 'STUDY_PLAN_QUESTION_BANK_EMPTY',
        message: '后台正式题库中没有数据完整的对应题型，请先补充并发布题目。'
      }, { status: 409 })
    }

    const { error: updateError } = await service
      .from('study_plan_tasks')
      .update({ question_id: question.id })
      .eq('id', task.id)
      .eq('user_id', check.user.id)

    if (updateError) {
      return json({
        success: false,
        code: 'STUDY_PLAN_QUESTION_ASSIGNMENT_FAILED',
        message: '后台题目绑定失败，请稍后重试。'
      }, { status: 500 })
    }
  }

  const questionId = question.id as string

  return json({
    success: true,
    task: {
      id: task.id,
      taskType: task.task_type,
      writingMode: task.writing_mode,
      questionId,
      questionSource: task.question_source
    },
    question: {
      id: questionId,
      taskType: question.task_type,
      title: question.title,
      questionText: question.question_text,
      task1VisualTypes: question.task1_visual_types,
      task1VisualData: question.task1_visual_data,
      task2QuestionType: question.task2_question_type
    }
  })
}
