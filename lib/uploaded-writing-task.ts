import { z } from 'zod'
import type { WritingQuestion } from '@/lib/ielts-questions'
import type {
  Task1ChartSpec,
  Task1MapSpec,
  Task1ProcessSpec,
  Task1StandaloneChartSpec
} from '@/lib/task1-chart-schema'

export const UploadMaxBytes = 10 * 1024 * 1024
export const UploadMaxPixels = 40_000_000
export const UploadMaxDimension = 12_000
export const UploadMinDimension = 160
export const UploadAllowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const
export const UploadAllowedExtensions = ['png', 'jpg', 'jpeg', 'webp'] as const

export type UploadedWritingTaskType = 'task1_academic' | 'task1_general_letter' | 'task2' | 'unknown'
export type UploadedWritingMode = 'task1' | 'task2'

const NullableNumberSchema = z.number().finite().nullable()

export const UploadedTaskUncertaintySchema = z.object({
  location: z.string().min(1).max(240),
  message: z.string().min(1).max(1_000)
})

const LineOrBarVisualSchema = z.object({
  kind: z.enum(['line', 'bar']),
  title: z.string().max(1_000).optional(),
  xAxis: z.object({
    label: z.string().max(300).optional(),
    categories: z.array(z.string().min(1).max(300)).min(1).max(150)
  }),
  yAxis: z.object({
    label: z.string().max(300).optional(),
    unit: z.string().max(200).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional()
  }).optional(),
  series: z.array(z.object({
    name: z.string().min(1).max(300),
    values: z.array(NullableNumberSchema).min(1).max(150)
  })).min(1).max(40)
}).superRefine((visual, context) => {
  visual.series.forEach((series, index) => {
    if (series.values.length !== visual.xAxis.categories.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series', index, 'values'],
        message: 'series.values 长度必须与 xAxis.categories 一致'
      })
    }
  })
})

const PieVisualSchema = z.object({
  kind: z.literal('pie'),
  title: z.string().max(1_000).optional(),
  unit: z.string().max(200).optional(),
  slices: z.array(z.object({
    label: z.string().min(1).max(300),
    value: NullableNumberSchema
  })).min(1).max(100)
})

const TableVisualSchema = z.object({
  kind: z.literal('table'),
  title: z.string().max(1_000).optional(),
  columns: z.array(z.string().min(1).max(300)).min(1).max(50),
  rows: z.array(z.array(z.union([z.string().max(1_000), NullableNumberSchema])).max(50)).min(1).max(150)
}).superRefine((visual, context) => {
  visual.rows.forEach((row, index) => {
    if (row.length !== visual.columns.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index],
        message: '表格每行单元格数量必须与 columns 一致'
      })
    }
  })
})

const MapVisualSchema = z.object({
  kind: z.literal('map'),
  title: z.string().max(1_000).optional(),
  locations: z.array(z.object({
    name: z.string().max(300).optional(),
    before: z.string().max(1_000).optional(),
    after: z.string().max(1_000).optional(),
    features: z.array(z.string().min(1).max(500)).max(40).default([]),
    position: z.object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100)
    }).optional()
  })).min(1).max(100),
  description: z.string().max(4_000).optional()
})

const ProcessVisualSchema = z.object({
  kind: z.literal('process'),
  title: z.string().max(1_000).optional(),
  steps: z.array(z.object({
    order: z.number().int().min(1).max(200),
    label: z.string().min(1).max(500),
    description: z.string().max(1_000).optional(),
    next: z.array(z.number().int().min(1).max(200)).max(20).optional()
  })).min(2).max(100)
})

export const UploadedTask1VisualSchema = z.union([
  LineOrBarVisualSchema,
  PieVisualSchema,
  TableVisualSchema,
  MapVisualSchema,
  ProcessVisualSchema
])

export const UploadedTask1LetterSchema = z.object({
  situation: z.string().min(1).max(4_000),
  recipient: z.string().min(1).max(1_000),
  purpose: z.string().min(1).max(2_000),
  bulletPoints: z.array(z.string().min(1).max(1_000)).min(1).max(20),
  tone: z.enum(['formal', 'semi_formal', 'informal'])
})

export const UploadedTask1ResultSchema = z.object({
  taskType: z.enum(['task1_academic', 'task1_general_letter']),
  questionText: z.string().min(10).max(16_000),
  minimumWords: z.number().int().min(100).max(500).default(150),
  suggestedMinutes: z.number().int().min(10).max(90).default(20),
  visuals: z.array(UploadedTask1VisualSchema).max(12).default([]),
  letter: UploadedTask1LetterSchema.optional(),
  sourceImagePath: z.string().max(1_000).default(''),
  parseStatus: z.enum(['complete', 'partial']).default('complete'),
  uncertainties: z.array(UploadedTaskUncertaintySchema).max(150).default([])
}).superRefine((result, context) => {
  if (result.taskType === 'task1_academic' && result.visuals.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['visuals'],
      message: 'Academic Task 1 必须包含至少一个视觉材料'
    })
  }
  if (result.taskType === 'task1_general_letter' && !result.letter) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['letter'],
      message: 'General Training Task 1 必须包含信件情境和 bullet points'
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
  questionText: z.string().min(10).max(16_000),
  detectedQuestionType: UploadedTask2QuestionTypeSchema,
  requirements: z.array(z.string().min(1).max(1_000)).min(1).max(30),
  minimumWords: z.number().int().min(100).max(500).default(250),
  suggestedMinutes: z.number().int().min(10).max(90).default(40),
  parseStatus: z.enum(['complete', 'partial']).default('complete'),
  uncertainties: z.array(z.string().min(1).max(1_000)).max(150).default([])
})

export const UploadedUnknownResultSchema = z.object({
  taskType: z.literal('unknown'),
  reason: z.enum(['not_ielts_writing_task', 'image_too_unclear', 'missing_critical_content']),
  message: z.string().min(1).max(1_000),
  uncertainties: z.array(z.string().min(1).max(1_000)).max(100).default([])
})

export const UploadedWritingTaskResultSchema = z.union([
  UploadedTask1ResultSchema,
  UploadedTask2ResultSchema,
  UploadedUnknownResultSchema
])

export type UploadedTask1Visual = z.infer<typeof UploadedTask1VisualSchema>
export type UploadedTask1Result = z.infer<typeof UploadedTask1ResultSchema>
export type UploadedTask2Result = z.infer<typeof UploadedTask2ResultSchema>
export type UploadedUnknownResult = z.infer<typeof UploadedUnknownResultSchema>
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

function splitQuestionText(questionText: string) {
  const normalized = questionText.trim()
  const paragraphBreak = normalized.lastIndexOf('\n\n')
  const lineBreak = normalized.lastIndexOf('\n')
  const splitAt = paragraphBreak > 0 ? paragraphBreak : lineBreak
  if (splitAt <= 0) return { promptLead: normalized, promptDetail: '' }
  return {
    promptLead: normalized.slice(0, splitAt).trim(),
    promptDetail: normalized.slice(splitAt).trim()
  }
}

function seriesId(name: string, index: number) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `series_${index + 1}`
}

function visualToStandalone(visual: UploadedTask1Visual, index: number): Task1StandaloneChartSpec | null {
  const title = visual.title || `Uploaded visual ${index + 1}`
  if (visual.kind === 'line' || visual.kind === 'bar') {
    return {
      chartType: visual.kind,
      title,
      xAxis: visual.xAxis,
      yAxis: visual.yAxis,
      series: visual.series.map((series, seriesIndex) => ({
        id: seriesId(series.name, seriesIndex),
        name: series.name,
        type: visual.kind,
        values: series.values
      })),
      units: visual.yAxis?.unit || '',
      legend: visual.series.length > 1
    }
  }
  if (visual.kind === 'pie') {
    return {
      chartType: 'pie',
      title,
      pieData: visual.slices.map((slice) => ({ label: slice.label, value: slice.value })),
      units: visual.unit || '',
      legend: true
    }
  }
  if (visual.kind === 'table') {
    return {
      chartType: 'table',
      title,
      tableData: { columns: visual.columns, rows: visual.rows },
      units: '',
      legend: false
    }
  }
  return null
}

function uploadedChartSpec(result: UploadedTask1Result): Task1ChartSpec | undefined {
  const charts = result.visuals
    .map(visualToStandalone)
    .filter((visual): visual is Task1StandaloneChartSpec => visual !== null)
  if (charts.length === 0) return undefined
  if (charts.length > 1) {
    return {
      kind: 'mixed',
      title: 'Uploaded Task 1 visuals',
      charts,
      legend: true
    }
  }
  const [chart] = charts
  return {
    kind: chart.chartType,
    title: chart.title,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    series: chart.series,
    pieData: chart.pieData,
    tableData: chart.tableData,
    legend: chart.legend
  }
}

function uploadedProcessSpec(result: UploadedTask1Result): Task1ProcessSpec | undefined {
  const visual = result.visuals.find((item) => item.kind === 'process')
  if (!visual || visual.kind !== 'process') return undefined
  const orders = new Set(visual.steps.map((step) => step.order))
  return {
    title: visual.title || 'Uploaded Task 1 process',
    stages: visual.steps.map((step) => ({
      id: `step_${step.order}`,
      label: step.label,
      description: step.description
    })),
    connections: visual.steps.flatMap((step) => {
      const next = step.next ?? []
      return next
        .filter((order) => orders.has(order))
        .map((order) => ({ from: `step_${step.order}`, to: `step_${order}` }))
    })
  }
}

function uploadedMapSpec(result: UploadedTask1Result): Task1MapSpec | undefined {
  const visual = result.visuals.find((item) => item.kind === 'map')
  if (!visual || visual.kind !== 'map' || visual.locations.some((location) => !location.position)) return undefined

  // Convert legacy point-based format to v2 block format
  const locations = visual.locations
  const beforeLocations = locations.filter((loc) => loc.before)
  const afterLocations = locations.filter((loc) => loc.after)

  function locationToFeature(loc: typeof locations[number], _index: number) {
    const label = (loc.name || '').toLowerCase()
    const combined = `${label} ${loc.before || ''} ${loc.after || ''} ${loc.features.join(' ')}`.toLowerCase()

    let type: 'river' | 'road' | 'bridge' | 'housing' | 'forest' | 'car_park' | 'building_row' | 'church' | 'footpath' | 'ferry' = 'building_row'
    let extra: Record<string, unknown> = {}

    if (combined.includes('river') || combined.includes('water')) {
      type = 'river'
      extra = { width: 100, height: 400 }
    } else if (combined.includes('road') || combined.includes('street')) {
      type = 'road'
      extra = { width: 520, height: 4, style: 'current' }
    } else if (combined.includes('bridge')) {
      type = 'bridge'
      extra = { width: 90, height: 14 }
    } else if (combined.includes('forest') || combined.includes('tree') || combined.includes('wood')) {
      type = 'forest'
      extra = { width: 120, height: 100, treeCount: 6 }
    } else if (combined.includes('house') || combined.includes('housing') || combined.includes('residential')) {
      type = 'housing'
      extra = { rows: 2, columns: 3 }
    } else if (combined.includes('car park') || combined.includes('parking')) {
      type = 'car_park'
      extra = { width: 100, height: 70, label: loc.name }
    } else if (combined.includes('church')) {
      type = 'church'
      extra = { planned: false }
    } else if (combined.includes('path') || combined.includes('footpath')) {
      type = 'footpath'
      extra = { style: 'future' }
    } else if (combined.includes('ferry') || combined.includes('dock') || combined.includes('harbour')) {
      type = 'ferry'
      extra = { width: 25, height: 30 }
    }

    const pos = loc.position!
    return {
      type,
      x: Math.round(pos.x * 5.2),
      y: Math.round(pos.y * 4.8),
      ...extra,
    }
  }

  const beforePanel = {
    id: 'panel-before',
    title: 'Before',
    features: beforeLocations.length > 0
      ? beforeLocations.map((loc, i) => locationToFeature(loc, i))
      : [{ type: 'road' as const, x: 0, y: 240, width: 520, height: 4, style: 'current' as const }],
  }

  const afterPanel = {
    id: 'panel-after',
    title: 'After',
    features: afterLocations.length > 0
      ? afterLocations.map((loc, i) => locationToFeature(loc, i))
      : [{ type: 'road' as const, x: 0, y: 240, width: 520, height: 4, style: 'current' as const }],
  }

  return {
    title: visual.title || 'Uploaded Task 1 map',
    dataVersion: 'map-v2',
    beforeLabel: 'Before',
    afterLabel: 'After',
    panels: [beforePanel, afterPanel],
  }
}

function task1QuestionType(result: UploadedTask1Result): WritingQuestion['questionType'] {
  if (result.taskType === 'task1_general_letter') return 'letter'
  const chartVisuals = result.visuals.filter((visual) => ['line', 'bar', 'pie', 'table'].includes(visual.kind))
  if (chartVisuals.length > 1) return 'mixed_charts'
  const first = result.visuals[0]
  if (!first) return 'static_comparison'
  const map: Record<UploadedTask1Visual['kind'], WritingQuestion['questionType']> = {
    line: 'line_chart',
    bar: 'bar_chart',
    pie: 'pie_chart',
    table: 'table',
    map: 'map',
    process: 'process'
  }
  return map[first.kind]
}

export function buildUploadedWritingQuestion(input: {
  uploadId: string
  result: Exclude<UploadedWritingTaskResult, UploadedUnknownResult>
}) {
  const { promptLead, promptDetail } = splitQuestionText(input.result.questionText)

  if (input.result.taskType === 'task2') {
    return {
      id: `uploaded-${input.uploadId}`,
      taskType: 'task2',
      title: '自定义题目 · IELTS Task 2',
      promptLead,
      promptDetail,
      durationMinutes: input.result.suggestedMinutes,
      wordTarget: input.result.minimumWords,
      questionType: task2QuestionType(input.result.detectedQuestionType),
      generatedSource: 'user_upload',
      structuredData: {
        source: 'user_upload',
        uploadedTaskId: input.uploadId,
        requirements: input.result.requirements,
        uncertainties: input.result.uncertainties,
        parseStatus: input.result.parseStatus
      }
    } satisfies WritingQuestion
  }

  const image = input.result.sourceImagePath || `/api/user/uploaded-writing-tasks/${input.uploadId}/image`
  return {
    id: `uploaded-${input.uploadId}`,
    taskType: 'task1',
    title: input.result.taskType === 'task1_general_letter'
      ? '自定义题目 · General Training Task 1'
      : '自定义题目 · Academic Task 1',
    promptLead,
    promptDetail,
    durationMinutes: input.result.suggestedMinutes,
    wordTarget: input.result.minimumWords,
    questionType: task1QuestionType(input.result),
    trainingType: input.result.taskType === 'task1_general_letter' ? 'general' : 'academic',
    generatedSource: 'user_upload',
    image,
    imageAlt: '用户上传的 IELTS Task 1 原始题目图片',
    chartSpec: uploadedChartSpec(input.result),
    processSpec: uploadedProcessSpec(input.result),
    mapSpec: uploadedMapSpec(input.result),
    structuredData: {
      source: 'user_upload',
      uploadedTaskId: input.uploadId,
      taskType: input.result.taskType,
      visuals: input.result.visuals,
      letter: input.result.letter,
      uncertainties: input.result.uncertainties,
      parseStatus: input.result.parseStatus
    }
  } satisfies WritingQuestion
}

export function buildConfirmedUploadedQuestion(input: {
  uploadId: string
  result: Exclude<UploadedWritingTaskResult, UploadedUnknownResult>
  questionText?: string
  detectedQuestionType?: UploadedTask2Result['detectedQuestionType']
}) {
  const result = input.result.taskType === 'task2'
    ? {
        ...input.result,
        questionText: input.questionText?.trim() || input.result.questionText,
        detectedQuestionType: input.detectedQuestionType || input.result.detectedQuestionType
      }
    : {
        ...input.result,
        questionText: input.questionText?.trim() || input.result.questionText
      }
  return buildUploadedWritingQuestion({ uploadId: input.uploadId, result })
}
