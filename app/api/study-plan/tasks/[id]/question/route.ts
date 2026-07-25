import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

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

  let questionId = task.question_id as string | null
  if (!questionId) {
    const expectedTaskType = task.task_type === 'task1' ? 'task1_academic' : 'task2'
    const [candidateResult, usedResult] = await Promise.all([
      service
        .from('past_paper_questions')
        .select('id')
        .eq('status', 'published')
        .eq('task_type', expectedTaskType)
        .order('published_at', { ascending: false })
        .limit(50),
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
    const candidates = candidateResult.data ?? []
    const candidate = candidates.find((item) => !usedQuestionIds.has(item.id)) ?? candidates[0]

    if (!candidate) {
      return json({
        success: false,
        code: 'STUDY_PLAN_QUESTION_BANK_EMPTY',
        message: '后台正式题库中没有可用的对应题型，请先补充并发布题目。'
      }, { status: 409 })
    }

    const { data: updatedTask, error: updateError } = await service
      .from('study_plan_tasks')
      .update({ question_id: candidate.id })
      .eq('id', task.id)
      .eq('user_id', check.user.id)
      .is('question_id', null)
      .select('question_id')
      .maybeSingle()

    if (updateError) {
      return json({
        success: false,
        code: 'STUDY_PLAN_QUESTION_ASSIGNMENT_FAILED',
        message: '后台题目绑定失败，请稍后重试。'
      }, { status: 500 })
    }

    if (updatedTask?.question_id) {
      questionId = updatedTask.question_id
    } else {
      const { data: refreshedTask } = await service
        .from('study_plan_tasks')
        .select('question_id')
        .eq('id', task.id)
        .eq('user_id', check.user.id)
        .maybeSingle()
      questionId = refreshedTask?.question_id ?? null
    }
  }

  if (!questionId) {
    return json({
      success: false,
      code: 'STUDY_PLAN_QUESTION_ASSIGNMENT_FAILED',
      message: '学习任务未能绑定后台题目，请稍后重试。'
    }, { status: 500 })
  }

  const { data: question, error: questionError } = await service
    .from('past_paper_questions')
    .select('id, task_type, title, question_text, task1_visual_types, task1_visual_data, task2_question_type')
    .eq('id', questionId)
    .eq('status', 'published')
    .maybeSingle()

  if (questionError || !question) {
    return json({
      success: false,
      code: 'STUDY_PLAN_QUESTION_NOT_AVAILABLE',
      message: '学习规划绑定的后台题目已不可用，请联系管理员检查题库。'
    }, { status: 409 })
  }

  const taskMatchesQuestion =
    (task.task_type === 'task1' && question.task_type.includes('task1'))
    || (task.task_type === 'task2' && question.task_type === 'task2')

  if (!taskMatchesQuestion) {
    return json({
      success: false,
      code: 'STUDY_PLAN_QUESTION_TYPE_MISMATCH',
      message: '学习任务与后台题目类型不一致，请联系管理员检查题库。'
    }, { status: 409 })
  }

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
      id: question.id,
      taskType: question.task_type,
      title: question.title,
      questionText: question.question_text,
      task1VisualTypes: question.task1_visual_types,
      task1VisualData: question.task1_visual_data,
      task2QuestionType: question.task2_question_type
    }
  })
}
