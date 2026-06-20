import { z } from 'zod'
import type { WritingQuestion } from '@/lib/ielts-questions'
import type { Task1ChartSpec, Task1MapSpec, Task1ProcessSpec } from '@/lib/task1-chart-schema'

export const UploadMaxBytes = 10 * 1024 * 1024
export const UploadMaxPixels = 40_000_000
export const UploadMaxDimension = 12_000
export const UploadMinDimension = 160
export const UploadAllowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const
export const UploadAllowedExtensions = ['png', 'jpg', 'jpeg', 'webp'] as const

export type UploadedWritingTaskType = 'task1' | 'task2'

const UncertaintySchema = z.object({
  field: z.string().min(1).max(120),
  message: z.string().min(1).max(500)
})

const NullableNumberSchema = z.number().finite().nullable()

export const UploadedTask1ResultSchema = z.object({
  taskType: z.literal('task1'),
  questionText: z.string().min(10).max(12_000),
  promptLead: z.string().min(1).max(8_000),
  promptDetail: z.string().min(1).max(4_000),
  instruction: z.string().max(4_000).default(''),
  minimumWords: z.number().int().min(100).max(500).default(150),
  suggestedMinutes: z.number().int().min(10).max(90).default(20),
  visualType: z.enum(['line', 'bar', 'pie', 'table', 'map', 'process', 'mixed', 'other']),
  visualTitle: z.string().max(1_000).default(''),
  unit: z.string().max(200).default(''),
  chart: z.object({
    categories: z.array(z.string().min(1).max(300)).min(1).max(100),
    series: z.array(z.object({
      name: z.string().min(1).max(300),
      data: z.array(NullableNumberSchema).min(1).max(100)
    })).min(1).max(30)
  }).optional(),
  process: z.object({
    stages: z.array(z.object({
      id: z.string().min(1).max(120),
      label: z.string().min(1).max(500),
      description: z.string().max(1_000).optional()
    })).min(2).max(50),
    connections: z.array(z.object({
      from: z.string().min(1).max(120),
      to: z.string().min(1).max(120),
      label: z.string().max(300).optional()
    })).max(100)
  }).optional(),
  map: z.object({
    beforeLabel: z.string().max(200).default('Before'),
    afterLabel: z.string().max(200).default('After'),
    regions: z.array(z.object({
      id: z.string().min(1).max(120),
      label: z.string().min(1).max(500),
      x: z.number().min(0).max(100).nullable(),
      y: z.number().min(0).max(100).nullable(),
      change: z.enum(['added', 'removed', 'modified', 'unchanged', 'uncertain']),
      description: z.string().max(1_000).optional()
    })).min(1).max(100)
  }).optional(),
  extractedText: z.array(z.string().min(1).max(1_000)).max(100).default([]),
  uncertainties: z.array(UncertaintySchema).max(100).default([]),
  taskTypeConflict: z.boolean().default(false)
}).superRefine((value, context) => {
  if (['line', 'bar', 'pie', 'table', 'mixed'].includes(value.visualType) && !value.chart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chart'], message: '图表类 Task 1 必须包含 chart' })
  }
  if (value.chart) {
    value.chart.series.forEach((series, index) => {
      if (series.data.length !== value.chart?.categories.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chart', 'series', index, 'data'],
          message: 'series.data 长度必须与 categories 一致'
        })
      }
    })
  }
})

export const UploadedTask2QuestionTypeSchema = z.enum([
  'agree_disagree',
  'discuss_both_views',
  'advantages_disadvantages',
  'outweigh',
  'causes_solutions',
  'problems_solutions',
  'positive_negative',
  'two_part',
  'direct_question',
  'other'
])

export const UploadedTask2ResultSchema = z.object({
  taskType: z.literal('task2'),
  questionText: z.string().min(10).max(12_000),
  promptLead: z.string().min(1).max(8_000),
  promptDetail: z.string().min(1).max(4_000),
  detectedQuestionType: UploadedTask2QuestionTypeSchema,
  requirements: z.array(z.string().min(1).max(1_000)).min(1).max(20),
  minimumWords: z.number().int().min(100).max(500).default(250),
  suggestedMinutes: z.number().int().min(10).max(90).default(40),
  uncertainties: z.array(z.string().min(1).max(500)).max(100).default([]),
  taskTypeConflict: z.boolean().default(false)
})

export const UploadedWritingTaskResultSchema = z.union([
  UploadedTask1ResultSchema,
  UploadedTask2ResultSchema
])

export type UploadedTask1Result = z.infer<typeof UploadedTask1ResultSchema>
export type UploadedTask2Result = z.infer<typeof UploadedTask2ResultSchema>
export type UploadedWritingTaskResult = z.infer<typeof UploadedWritingTaskResultSchema>

export type ValidatedImage = {
  mimeType: (typeof UploadAllowedMimeTypes)[number]
  extension: 'png' | 'jpg' | 'webp'
  width: number
  height: number
}

function readPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) return null
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!signature.every((value, index) => bytes[index] === value)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { mimeType: 'image/png' as const, extension: 'png' as const, width: view.getUint32(16), height: view.getUint32(20) }
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > bytes.length) break
    const length = (bytes[offset] << 8) + bytes[offset + 1]
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isSof && offset + 7 < bytes.length) {
      return {
        mimeType: 'image/jpeg' as const,
        extension: 'jpg' as const,
        height: (bytes[offset + 3] << 8) + bytes[offset + 4],
        width: (bytes[offset + 5] << 8) + bytes[offset + 6]
      }
    }
    if (length < 2) break
    offset += length
  }
  return null
}

function readWebpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  ) {
    return null
  }
  const chunk = String.fromCharCode(...bytes.slice(12, 16))
  if (chunk === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    return { mimeType: 'image/webp' as const, extension: 'webp' as const, width, height }
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return {
      mimeType: 'image/webp' as const,
      extension: 'webp' as const,
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    }
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      mimeType: 'image/webp' as const,
      extension: 'webp' as const,
      width: bytes[26] + ((bytes[27] & 0x3f) << 8),
      height: bytes[28] + ((bytes[29] & 0x3f) << 8)
    }
  }
  return null
}

export function inspectImageBytes(bytes: Uint8Array): ValidatedImage {
  const image = readPngDimensions(bytes) || readJpegDimensions(bytes) || readWebpDimensions(bytes)
  if (!image) throw new Error('图片无法解码或格式不受支持')
  if (
    image.width < UploadMinDimension ||
    image.height < UploadMinDimension ||
    image.width > UploadMaxDimension ||
    image.height > UploadMaxDimension ||
    image.width * image.height > UploadMaxPixels
  ) {
    throw new Error('图片像素尺寸不符合要求')
  }
  return image
}

export function validateImageUpload(input: {
  name: string
  reportedMimeType: string
  size: number
  bytes: Uint8Array
}) {
  if (input.size <= 0 || input.size > UploadMaxBytes) throw new Error('图片大小必须在 10 MB 以内')
  if (!UploadAllowedMimeTypes.includes(input.reportedMimeType as never)) {
    throw new Error('仅支持 PNG、JPG/JPEG 和 WebP 图片')
  }
  const extension = input.name.split('.').pop()?.toLowerCase() || ''
  if (!UploadAllowedExtensions.includes(extension as never)) throw new Error('仅支持 PNG、JPG/JPEG 和 WebP 图片')
  const inspected = inspectImageBytes(input.bytes)
  if (input.reportedMimeType !== inspected.mimeType) {
    throw new Error('图片 MIME 类型与实际内容不一致')
  }
  if (extension === 'png' && inspected.extension !== 'png') throw new Error('图片扩展名与实际内容不一致')
  if ((extension === 'jpg' || extension === 'jpeg') && inspected.extension !== 'jpg') throw new Error('图片扩展名与实际内容不一致')
  if (extension === 'webp' && inspected.extension !== 'webp') throw new Error('图片扩展名与实际内容不一致')
  return inspected
}

function task2QuestionType(value: UploadedTask2Result['detectedQuestionType']) {
  const map: Record<UploadedTask2Result['detectedQuestionType'], WritingQuestion['questionType']> = {
    agree_disagree: 'agree_disagree',
    discuss_both_views: 'discussion_opinion',
    advantages_disadvantages: 'advantages_disadvantages',
    outweigh: 'outweigh',
    causes_solutions: 'cause_solution',
    problems_solutions: 'problem_solution',
    positive_negative: 'positive_negative',
    two_part: 'two_part',
    direct_question: 'direct_question',
    other: 'direct_question'
  }
  return map[value]
}

function task1QuestionType(value: UploadedTask1Result['visualType']): WritingQuestion['questionType'] {
  const map: Record<UploadedTask1Result['visualType'], WritingQuestion['questionType']> = {
    line: 'line_chart',
    bar: 'bar_chart',
    pie: 'pie_chart',
    table: 'table',
    map: 'map',
    process: 'process',
    mixed: 'mixed_charts',
    other: 'static_comparison'
  }
  return map[value]
}

function reliableChartSpec(result: UploadedTask1Result): Task1ChartSpec | undefined {
  if (!result.chart || result.uncertainties.length > 0) return undefined
  const { categories, series } = result.chart
  if (series.some((item) => item.data.length !== categories.length || item.data.some((value) => value === null))) return undefined
  if (result.visualType === 'pie' && series.length === 1) {
    return {
      kind: 'pie',
      title: result.visualTitle || 'Uploaded Task 1 chart',
      pieData: categories.map((label, index) => ({ label, value: series[0].data[index] as number })),
      legend: true
    }
  }
  if (result.visualType !== 'line' && result.visualType !== 'bar') return undefined
  const chartType = result.visualType
  return {
    kind: chartType,
    title: result.visualTitle || 'Uploaded Task 1 chart',
    xAxis: { categories },
    yAxis: result.unit ? { unit: result.unit } : undefined,
    series: series.map((item, index) => ({
      id: `series_${index + 1}`,
      name: item.name,
      type: chartType,
      values: item.data as number[]
    })),
    legend: series.length > 1
  }
}

function reliableProcessSpec(result: UploadedTask1Result): Task1ProcessSpec | undefined {
  if (result.visualType !== 'process' || !result.process || result.uncertainties.length > 0) return undefined
  const ids = new Set(result.process.stages.map((stage) => stage.id))
  if (result.process.connections.some((connection) => !ids.has(connection.from) || !ids.has(connection.to))) return undefined
  return {
    title: result.visualTitle || 'Uploaded Task 1 process',
    stages: result.process.stages,
    connections: result.process.connections
  }
}

function reliableMapSpec(result: UploadedTask1Result): Task1MapSpec | undefined {
  if (result.visualType !== 'map' || !result.map || result.uncertainties.length > 0) return undefined
  if (result.map.regions.some((region) => region.x === null || region.y === null || region.change === 'uncertain')) return undefined
  return {
    title: result.visualTitle || 'Uploaded Task 1 map',
    beforeLabel: result.map.beforeLabel,
    afterLabel: result.map.afterLabel,
    features: result.map.regions.map((region) => ({
      id: region.id,
      label: region.label,
      position: { x: region.x as number, y: region.y as number },
      change: region.change as Exclude<typeof region.change, 'uncertain'>,
      description: region.description
    }))
  }
}

export function buildConfirmedUploadedQuestion(input: {
  uploadId: string
  result: UploadedWritingTaskResult
  questionText: string
  detectedQuestionType?: UploadedTask2Result['detectedQuestionType']
}) {
  const questionText = input.questionText.trim()
  if (questionText.length < 10) throw new Error('题目文字过短，请检查识别结果')
  const splitAt = questionText.lastIndexOf('\n')
  const fallbackLead = splitAt > 0 ? questionText.slice(0, splitAt).trim() : questionText
  const fallbackDetail = splitAt > 0 ? questionText.slice(splitAt + 1).trim() : ''
  const image = `/api/user/uploaded-writing-tasks/${input.uploadId}/image`

  if (input.result.taskType === 'task2') {
    const detected = input.detectedQuestionType || input.result.detectedQuestionType
    return {
      id: `uploaded-${input.uploadId}`,
      taskType: 'task2',
      title: '自定义题目 · IELTS Task 2',
      promptLead: fallbackLead || input.result.promptLead,
      promptDetail: fallbackDetail || input.result.promptDetail,
      durationMinutes: input.result.suggestedMinutes,
      wordTarget: input.result.minimumWords,
      questionType: task2QuestionType(detected),
      generatedSource: 'user_upload',
      structuredData: {
        source: 'user_upload',
        uploadedTaskId: input.uploadId,
        requirements: input.result.requirements,
        uncertainties: input.result.uncertainties
      }
    } satisfies WritingQuestion
  }

  return {
    id: `uploaded-${input.uploadId}`,
    taskType: 'task1',
    title: '自定义题目 · IELTS Task 1',
    promptLead: fallbackLead || input.result.promptLead,
    promptDetail: fallbackDetail || input.result.promptDetail,
    durationMinutes: input.result.suggestedMinutes,
    wordTarget: input.result.minimumWords,
    questionType: task1QuestionType(input.result.visualType),
    trainingType: 'academic',
    generatedSource: 'user_upload',
    image,
    imageAlt: '用户上传的 IELTS Task 1 原始图表',
    chartSpec: reliableChartSpec(input.result),
    processSpec: reliableProcessSpec(input.result),
    mapSpec: reliableMapSpec(input.result),
    structuredData: {
      source: 'user_upload',
      uploadedTaskId: input.uploadId,
      extractedText: input.result.extractedText,
      uncertainties: input.result.uncertainties,
      visualType: input.result.visualType
    }
  } satisfies WritingQuestion
}
