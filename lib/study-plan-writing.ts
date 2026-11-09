import {
  isWritableTaskType,
  taskTypeToWriteMode,
  type StudyPlanTask
} from '@/lib/study-plan-types'

type StudyPlanWritingTask = Pick<
  StudyPlanTask,
  'id' | 'taskType' | 'questionId' | 'questionSource'
> & Pick<StudyPlanTask, 'hasAssignedMock'>

export function studyPlanWritingHref(task: StudyPlanWritingTask) {
  if (!isWritableTaskType(task.taskType)) return null
  const mode = taskTypeToWriteMode(task.taskType)
  if (!mode) return null

  const params = new URLSearchParams({ studyPlanTaskId: task.id })
  const isSingleQuestionTask = mode === 'task1' || mode === 'task2'

  if (task.questionSource === 'question_bank') {
    if (!isSingleQuestionTask && !task.hasAssignedMock) return null
    if (isSingleQuestionTask && task.questionId) params.set('pastPaper', task.questionId)
  }

  return `/write/${mode}?${params.toString()}`
}
