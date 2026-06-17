import { z } from 'zod'

export const Task1ChartKindSchema = z.enum(['line', 'bar', 'pie', 'table', 'mixed'])
export type Task1ChartKind = z.infer<typeof Task1ChartKindSchema>

export const Task1ChartRendererSchema = z.enum(['line', 'bar', 'pie', 'table', 'mixed', 'process', 'map'])
export type Task1ChartRenderer = z.infer<typeof Task1ChartRendererSchema>

export const TASK1_RENDERER_MAP: Record<string, Task1ChartRenderer> = {
  line_graph: 'line',
  line_chart: 'line',
  bar_chart: 'bar',
  pie_chart: 'pie',
  table: 'table',
  mixed_charts: 'mixed',
  process: 'process',
  map: 'map',
  floor_plan: 'map',
  before_after: 'map',
  dynamic_chart: 'line',
  static_comparison: 'bar'
}

export function resolveChartRenderer(chartType: string): Task1ChartRenderer {
  return TASK1_RENDERER_MAP[chartType] ?? 'line'
}

export const Task1AxisSchema = z.object({
  label: z.string().optional(),
  categories: z.array(z.string()).min(1),
  unit: z.string().optional()
})

export const Task1YAxisSchema = z.object({
  label: z.string().optional(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional()
})

export const Task1SeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['line', 'bar']).optional(),
  values: z.array(z.number()).min(1)
})

export const Task1PieDataSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite()
})

export const Task1TableDataSchema = z.object({
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).min(1)
})

export const Task1ChartSpecSchema = z.object({
  kind: Task1ChartKindSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  xAxis: Task1AxisSchema.optional(),
  yAxis: Task1YAxisSchema.optional(),
  series: z.array(Task1SeriesSchema).optional(),
  pieData: z.array(Task1PieDataSchema).optional(),
  tableData: Task1TableDataSchema.optional(),
  legend: z.boolean().optional(),
  source: z.string().optional()
})

export type Task1ChartSpec = z.infer<typeof Task1ChartSpecSchema>

export const Task1ProcessSpecSchema = z.object({
  title: z.string().min(1),
  stages: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional()
  })).min(2),
  connections: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().optional()
  })).optional()
})

export type Task1ProcessSpec = z.infer<typeof Task1ProcessSpecSchema>

export const Task1MapSpecSchema = z.object({
  title: z.string().min(1),
  beforeLabel: z.string().default('Before'),
  afterLabel: z.string().default('After'),
  features: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    position: z.object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100)
    }),
    change: z.enum(['added', 'removed', 'modified', 'unchanged']).optional(),
    description: z.string().optional()
  })).min(1),
  legend: z.array(z.object({
    color: z.string(),
    label: z.string()
  })).optional()
})

export type Task1MapSpec = z.infer<typeof Task1MapSpecSchema>

export interface Task1QuestionData {
  id: string
  taskType: 'task1'
  chartType: string
  title: string
  prompt: string
  instructions: string
  sourceNote?: string
  chartSpec?: Task1ChartSpec
  processSpec?: Task1ProcessSpec
  mapSpec?: Task1MapSpec
}

export function validateChartSpec(spec: unknown, expectedKind?: Task1ChartKind): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const parsed = Task1ChartSpecSchema.safeParse(spec)
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }
  }

  const data = parsed.data

  if (expectedKind && data.kind !== expectedKind) {
    errors.push(`Expected kind "${expectedKind}" but got "${data.kind}"`)
  }

  if (data.kind === 'line' || data.kind === 'bar' || data.kind === 'mixed') {
    if (!data.series || data.series.length === 0) {
      errors.push('Chart requires at least one series')
    }
    if (data.xAxis && data.series) {
      for (const s of data.series) {
        if (s.values.length !== data.xAxis.categories.length) {
          errors.push(`Series "${s.name}" has ${s.values.length} values but xAxis has ${data.xAxis.categories.length} categories`)
        }
      }
    }
    if (data.series) {
      for (const s of data.series) {
        if (!s.values.every(v => Number.isFinite(v))) {
          errors.push(`Series "${s.name}" contains non-finite values`)
        }
      }
    }
    if (data.kind === 'mixed' && data.series) {
      const hasType = data.series.every(s => s.type)
      if (!hasType) {
        errors.push('Mixed chart requires each series to have a type (line or bar)')
      }
    }
  }

  if (data.kind === 'pie') {
    if (!data.pieData || data.pieData.length === 0) {
      errors.push('Pie chart requires pieData')
    }
    if (data.pieData) {
      const total = data.pieData.reduce((sum, d) => sum + d.value, 0)
      if (Math.abs(total - 100) > 5) {
        errors.push(`Pie data total is ${total}, expected ~100`)
      }
    }
  }

  if (data.kind === 'table') {
    if (!data.tableData) {
      errors.push('Table requires tableData')
    }
    if (data.tableData) {
      const colCount = data.tableData.columns.length
      for (let i = 0; i < data.tableData.rows.length; i++) {
        if (data.tableData.rows[i].length !== colCount) {
          errors.push(`Row ${i} has ${data.tableData.rows[i].length} columns but header has ${colCount}`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export function createChartSpecLog(spec: Task1ChartSpec | undefined) {
  if (!spec) return { chartKind: 'none', categoryCount: 0, seriesCount: 0, dataPointCount: 0 }

  let categoryCount = 0
  let seriesCount = 0
  let dataPointCount = 0

  if (spec.xAxis?.categories) categoryCount = spec.xAxis.categories.length
  if (spec.series) {
    seriesCount = spec.series.length
    dataPointCount = spec.series.reduce((sum, s) => sum + s.values.length, 0)
  }
  if (spec.pieData) {
    dataPointCount = spec.pieData.length
  }
  if (spec.tableData) {
    dataPointCount = spec.tableData.rows.length * spec.tableData.columns.length
  }

  return { chartKind: spec.kind, categoryCount, seriesCount, dataPointCount }
}
