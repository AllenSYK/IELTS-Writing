import { AiResponseError, createAiRequestId, getVisionAiConfig, requestValidatedJson } from '@/lib/ai-provider'
import {
  UploadedTask1ResultSchema,
  UploadedTask2ResultSchema,
  type UploadedWritingTaskResult,
  type UploadedWritingTaskType
} from '@/lib/uploaded-writing-task'

const systemPrompt = `You extract IELTS Writing tasks from one uploaded image.
Return one strict JSON object only. Never answer the writing task, write an essay, grade an essay, or invent unreadable values.
Ignore page headers, footers, watermarks, answer samples, unrelated navigation, and question numbers.
The user-selected task type is authoritative. You may set taskTypeConflict=true when the image appears to be another task type, but you must not change taskType.
Unreadable numeric chart values must be null and explained in uncertainties. Do not estimate them.
Preserve every sub-question in Task 2.`

function taskPrompt(taskType: UploadedWritingTaskType) {
  if (taskType === 'task1') {
    return `The selected type is task1. Extract:
- questionText as the complete editable task text
- promptLead and promptDetail separately
- instruction, minimumWords, suggestedMinutes
- visualType: line, bar, pie, table, map, process, mixed, or other
- visualTitle, unit, extractedText
- for numeric charts: categories and non-empty series; every series.data length must equal categories length; use null for unreadable values
- for processes: stages and directed connections
- for maps: regions, before/after labels, normalized x/y coordinates only when visible, and change status
- uncertainties as objects with field and message
- taskTypeConflict
Do not convert maps or processes into ordinary chart data.`
  }

  return `The selected type is task2. Extract:
- questionText as the complete editable task text
- promptLead and promptDetail separately
- detectedQuestionType: agree_disagree, discuss_both_views, advantages_disadvantages, outweigh, causes_solutions, problems_solutions, positive_negative, two_part, direct_question, or other
- requirements including every explicit sub-question
- minimumWords and suggestedMinutes
- uncertainties and taskTypeConflict
Do not include sample answers, headers, footers, or watermarks.`
}

export async function parseUploadedWritingTask({
  taskType,
  signedImageUrl,
  requestId = createAiRequestId('parse')
}: {
  taskType: UploadedWritingTaskType
  signedImageUrl: string
  requestId?: string
}): Promise<{ result: UploadedWritingTaskResult; model: string; requestId: string }> {
  const config = getVisionAiConfig()
  const schema = taskType === 'task1' ? UploadedTask1ResultSchema : UploadedTask2ResultSchema
  const result = await requestValidatedJson({
    config,
    requestId,
    stage: 'uploaded-task-vision-parse',
    maxTokens: taskType === 'task1' ? 7000 : 3500,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: taskPrompt(taskType) },
          { type: 'image_url', image_url: { url: signedImageUrl } }
        ]
      }
    ],
    validate(value) {
      const parsed = schema.safeParse(value)
      if (!parsed.success) {
        throw new AiResponseError(
          '题目识别结果未通过结构校验。',
          'uploaded_task_schema_invalid',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        )
      }
      return parsed.data
    }
  })

  return { result, model: config.model, requestId }
}
