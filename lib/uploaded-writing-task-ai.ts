import { AiResponseError, createAiRequestId, getVisionAiConfig, requestValidatedJson } from '@/lib/ai-provider'
import {
  UploadedWritingTaskResultSchema,
  type UploadedWritingTaskResult
} from '@/lib/uploaded-writing-task'

export const uploadedTaskSystemPrompt = `You are a precise IELTS Writing task image parser and visual reconstruction engine.

Return exactly one valid JSON object.
Do not use Markdown.
Do not wrap the JSON in code fences.
Do not include any explanation before or after the JSON.
Do not stream the response.
Never answer the writing task, write an essay, grade an essay, or invent unreadable text or numbers.

The uploaded image may contain borders, black bars, white margins, colored backgrounds, browser UI, mobile gallery controls, page counters, status bars, shadows, rounded corners, watermarks, desktop backgrounds, paper edges, rotation, perspective distortion, mild blur, or unrelated surrounding content.
First locate the actual IELTS writing task region.
Ignore all non-question interface elements and surrounding borders.
Do not reject an image merely because it contains extra borders or UI.
Never treat page counters such as 1/4, close buttons, mobile home indicators, browser address bars, filenames, upload-page UI, system time, or unrelated watermarks as task content.

Work in this order:
1. Locate the actual writing-task region.
2. Separate the task wording from visual material.
3. Classify as task1_academic, task1_general_letter, task2, or unknown.
4. Reconstruct all readable Task 1 visual structures without simplifying or merging independent visuals.

Classification:
- task1_academic includes charts, graphs, tables, maps, processes, multiple visuals, Academic Writing Task 1, "summarise the information", "selecting and reporting the main features", or "make comparisons where relevant".
- task1_general_letter is a General Training letter task. Extract its situation, recipient, purpose, every bullet point, and tone. Do not misclassify it as Task 2 merely because it has no chart.
- task2 includes essays such as agree/disagree, discuss both views, advantages/disadvantages, outweigh, causes/solutions, problems/solutions, positive/negative, two-part questions, direct questions, "Give reasons for your answer", or example requirements.
- unknown is allowed only when no IELTS writing task can be identified, the task wording is unreadable, or critical content is missing. Complex visuals alone are never a reason to return unknown.

For unreadable numeric values, use null and add a matching uncertainty. Never estimate or fabricate a value.
Use parseStatus "partial" when the task type and wording are usable but some visual details are unclear. Partial Task 1 results are valid.
Use parseStatus "complete" only when all important wording and visual data are reliably readable.`

export const uploadedTaskUserPrompt = `Extract and reconstruct the IELTS writing task in the image.

Return one object matching exactly one of these shapes:

Academic Task 1:
{
  "taskType": "task1_academic",
  "questionText": "complete task wording",
  "minimumWords": 150,
  "suggestedMinutes": 20,
  "visuals": [Task1Visual, ...],
  "parseStatus": "complete or partial",
  "uncertainties": [{"location": "precise field path or image region", "message": "what is unclear"}]
}

General Training Task 1:
{
  "taskType": "task1_general_letter",
  "questionText": "complete task wording including every bullet point",
  "minimumWords": 150,
  "suggestedMinutes": 20,
  "visuals": [],
  "letter": {
    "situation": "full situation",
    "recipient": "intended recipient",
    "purpose": "writing purpose",
    "bulletPoints": ["every bullet point in order"],
    "tone": "formal or semi_formal or informal"
  },
  "parseStatus": "complete or partial",
  "uncertainties": []
}

Task 2:
{
  "taskType": "task2",
  "questionText": "complete wording including background, every question, minimum word instruction, and example instruction",
  "detectedQuestionType": "agree_disagree or discuss_both_views or advantages_disadvantages or outweigh or causes_solutions or problems_solutions or positive_negative or two_part or direct_question or other",
  "requirements": ["every explicit question and instruction in order"],
  "minimumWords": 250,
  "suggestedMinutes": 40,
  "parseStatus": "complete or partial",
  "uncertainties": []
}

Unknown:
{
  "taskType": "unknown",
  "reason": "not_ielts_writing_task or image_too_unclear or missing_critical_content",
  "message": "clear reason",
  "uncertainties": []
}

Task1Visual is one of:
- line/bar: {"kind":"line or bar","title":"original title","xAxis":{"label":"optional","categories":["all labels/years"]},"yAxis":{"label":"optional","unit":"optional","min":0,"max":100},"series":[{"name":"original legend name","values":[number or null]}]}
- pie: {"kind":"pie","title":"original title","unit":"optional","slices":[{"label":"original label","value":number or null}]}
- table: {"kind":"table","title":"original title","columns":["all headers"],"rows":[["every cell as string, number, or null"]]}
- map: {"kind":"map","title":"original title","locations":[{"name":"optional","before":"optional","after":"optional","features":["all readable features"],"position":{"x":0-100,"y":0-100}}],"description":"spatial relationships and changes"}
- process: {"kind":"process","title":"original title","steps":[{"order":1,"label":"stage label","description":"optional","next":[2]}]}

Preserve original titles, legends, axes, units, years, categories, series relationships, percentages, map changes, process order and branches.
For mixed or multiple visuals, create one separate visuals[] item per independent visual. Never force a line chart and a pie chart into one series.
Do not output sourceImagePath; the server adds the private image path.`

export async function parseUploadedWritingTask({
  signedImageUrl,
  requestId = createAiRequestId('parse')
}: {
  signedImageUrl: string
  requestId?: string
}): Promise<{ result: UploadedWritingTaskResult; model: string; requestId: string }> {
  const config = getVisionAiConfig()
  const result = await requestValidatedJson({
    config,
    requestId,
    stage: 'uploaded-task-vision-parse',
    maxTokens: 10_000,
    responseMode: 'non-stream',
    messages: [
      {
        role: 'system',
        content: [{ type: 'text', text: uploadedTaskSystemPrompt }]
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: signedImageUrl } },
          { type: 'text', text: uploadedTaskUserPrompt }
        ]
      }
    ],
    validate(value) {
      const parsed = UploadedWritingTaskResultSchema.safeParse(value)
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
