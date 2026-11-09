import type { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { writingQuestionFromPastPaper } from '@/lib/past-paper-practice'
import { generateWritingPromptWithAi } from '@/lib/writing-prompt-generation'
import type { PromptSelection } from '@/lib/writing-options'
import type { StudyPlanDiagnosis } from '@/lib/study-plan-types'
import type { WritingRecord } from '@/lib/writing-record-types'
import type { WritingQuestion } from '@/lib/ielts-questions'
import type { PlannerPreferences, TrainingTask } from '@/lib/study-plan/allocator'
import { assignTrainingQuestions, focusQuestionTypes, type QuestionAssignments } from '@/lib/study-plan/question-allocation'

type Service = ReturnType<typeof createSupabaseServiceRoleClient>

export async function materializeTraining(
  service: Service, userId: string, tasks: TrainingTask[], diagnosis: StudyPlanDiagnosis,
  preferences: PlannerPreferences, records: WritingRecord[], priorCount = 0
) {
  const bank = { task1: [] as WritingQuestion[], task2: [] as WritingQuestion[] }
  const needsQuestion = tasks.some(task => task.writingMode || task.taskType === 'full_test')
  const recent = records.slice(0, 30).flatMap(record => record.taskType === 'mock'
    ? Object.values(record.components ?? {}).map(item => ({ id: item.questionId, prompt: item.prompt }))
    : [{ id: record.questionId, prompt: record.prompt }])
  if (needsQuestion) {
    const [bankResult, history] = await Promise.all([
      service.from('past_paper_questions')
        .select('id, task_type, title, question_text, task1_visual_types, task1_visual_data, task2_question_type')
        .eq('status', 'published').eq('is_visible', true).in('task_type', ['task1_academic', 'task2'])
        .order('published_at', { ascending: false }).order('id'),
      service.from('study_plan_tasks').select('question_id, assigned_questions').eq('user_id', userId)
        .order('scheduled_date', { ascending: false }).limit(70)
    ])
    if (bankResult.error || history.error) throw new Error('STUDY_PLAN_QUESTION_LOOKUP_FAILED')
    for (const row of bankResult.data ?? []) {
      try {
        const question = writingQuestionFromPastPaper({
          id: row.id, taskType: row.task_type, title: row.title, questionText: row.question_text,
          task1VisualTypes: row.task1_visual_types, task1VisualData: row.task1_visual_data, task2QuestionType: row.task2_question_type
        })
        bank[question.taskType].push(question)
      } catch { /* Unpublished or incomplete legacy content cannot be assigned. */ }
    }
    for (const row of history.data ?? []) {
      if (row.question_id) recent.push({ id: row.question_id, prompt: '' })
      for (const assignment of Object.values((row.assigned_questions ?? {}) as QuestionAssignments)) {
        const q = assignment?.question
        if (q) recent.push({ id: q.id, prompt: `${q.promptLead} ${q.promptDetail}` })
      }
    }
  }
  return assignTrainingQuestions({
    tasks, bankRatio: preferences.questionBankRatio, bank, recent, priorCount,
    preferred: { task1: focusQuestionTypes('task1', diagnosis, preferences.weaknesses),
      task2: focusQuestionTypes('task2', diagnosis, preferences.weaknesses) },
    generate: (mode, subtype, exclude) => generateWritingPromptWithAi({
      taskType: mode,
      selection: {
        task1ChartType: mode === 'task1' && subtype ? subtype as PromptSelection['task1ChartType'] : 'random',
        task1Subtype: 'random',
        task2EssayType: mode === 'task2' && subtype ? subtype as PromptSelection['task2EssayType'] : 'random',
        task2Topic: 'random'
      },
      excludePromptSummaries: exclude.filter(Boolean).map(questionText => ({ questionText }))
    })
  })
}
