import { z } from 'zod'

export const Task1ChartKindSchema = z.enum(['line', 'bar', 'pie', 'table', 'mixed'])
export type Task1ChartKind = z.infer<typeof Task1ChartKindSchema>

export const Task1StandaloneChartKindSchema = z.enum(['line', 'bar', 'pie', 'table'])
export type Task1StandaloneChartKind = z.infer<typeof Task1StandaloneChartKindSchema>

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
  values: z.array(z.number().nullable()).min(1)
})

export const Task1PieDataSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite().nullable()
})

export const Task1TableDataSchema = z.object({
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).min(1)
})

export const Task1StandaloneChartSpecSchema = z.object({
  chartType: Task1StandaloneChartKindSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  xAxis: Task1AxisSchema.optional(),
  yAxis: Task1YAxisSchema.optional(),
  series: z.array(Task1SeriesSchema).optional(),
  pieData: z.array(Task1PieDataSchema).optional(),
  tableData: Task1TableDataSchema.optional(),
  units: z.string().default(''),
  legend: z.boolean().default(true),
  source: z.string().optional()
})

export type Task1StandaloneChartSpec = z.infer<typeof Task1StandaloneChartSpecSchema>

export const Task1ChartSpecSchema = z.object({
  kind: Task1ChartKindSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  xAxis: Task1AxisSchema.optional(),
  yAxis: Task1YAxisSchema.optional(),
  series: z.array(Task1SeriesSchema).optional(),
  pieData: z.array(Task1PieDataSchema).optional(),
  tableData: Task1TableDataSchema.optional(),
  charts: z.array(Task1StandaloneChartSpecSchema).min(2).max(12).optional(),
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

/**
 * 地图数据版本
 * - map-v1: 旧格式，使用点状节点（已废弃）
 * - map-v2: 新格式，使用结构化SVG平面图
 */
export const MAP_DATA_VERSION = 'map-v2' as const
export const MAP_DATA_VERSION_V1 = 'map-v1' as const

/**
 * 地图元素类型
 */
export const MapFeatureTypeSchema = z.enum([
  'river',
  'road',
  'bridge',
  'housing',
  'forest',
  'car_park',
  'building_row',
  'church',
  'footpath',
  'ferry'
])

/**
 * 地图元素（map-v2格式）
 */
export const MapFeatureV2Schema = z.object({
  type: MapFeatureTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  style: z.enum(['current', 'future']).optional(),
  label: z.string().optional(),
  planned: z.boolean().optional(),
  path: z.string().optional(),
  treeCount: z.number().optional(),
  rows: z.number().optional(),
  columns: z.number().optional(),
  units: z.number().optional()
})

/**
 * 地图面板（map-v2格式）
 */
export const MapPanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  features: z.array(MapFeatureV2Schema)
})

/**
 * 地图规格（支持v1和v2格式）
 */
export const Task1MapSpecSchema = z.object({
  title: z.string().min(1),
  dataVersion: z.enum([MAP_DATA_VERSION, MAP_DATA_VERSION_V1]).optional(),
  // v1 格式字段（已废弃，但保留兼容性）
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
  })).optional(),
  // v2 格式字段
  panels: z.array(MapPanelSchema).optional(),
  legend: z.array(z.object({
    color: z.string(),
    label: z.string()
  })).optional()
})

export type Task1MapSpec = z.infer<typeof Task1MapSpecSchema>
export type MapFeatureV2 = z.infer<typeof MapFeatureV2Schema>
export type MapPanel = z.infer<typeof MapPanelSchema>

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

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null)
}

function toStringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const output = value.map((item) => String(item).trim()).filter(Boolean)
  return output.length > 0 ? output : undefined
}

function toNumberArray(value: unknown): Array<number | null> | undefined {
  if (!Array.isArray(value)) return undefined
  const output = value.map((item) => {
    if (item === null) return null
    const number = typeof item === 'number' ? item : Number(item)
    return number
  })
  return output.length > 0 && output.every((item) => item === null || Number.isFinite(item))
    ? output
    : undefined
}

function normalizeStandaloneKind(value: unknown, hint?: Task1StandaloneChartKind): Task1StandaloneChartKind | undefined {
  if (hint) return hint
  if (typeof value !== 'string') return undefined
  const normalized = value.toLowerCase().trim().replace(/[\s-]+/g, '_')
  const map: Record<string, Task1StandaloneChartKind> = {
    line: 'line',
    line_chart: 'line',
    line_graph: 'line',
    bar: 'bar',
    bar_chart: 'bar',
    column: 'bar',
    column_chart: 'bar',
    pie: 'pie',
    pie_chart: 'pie',
    table: 'table',
    data_table: 'table'
  }
  return map[normalized]
}

function seriesId(value: unknown, index: number) {
  const candidate = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return candidate || `series_${index + 1}`
}

function normalizeSeries(value: unknown, defaultType?: 'line' | 'bar'): z.infer<typeof Task1SeriesSchema>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const values = toNumberArray(firstDefined(item.values, item.data, item.points))
    if (!values) return []
    const name = toStringValue(firstDefined(item.name, item.label, item.title)) || `Series ${index + 1}`
    const rawType = normalizeStandaloneKind(firstDefined(item.type, item.chartType))
    const type = rawType === 'line' || rawType === 'bar' ? rawType : defaultType
    return [{
      id: toStringValue(item.id) || seriesId(name, index),
      name,
      ...(type ? { type } : {}),
      values
    }]
  })
  return normalized.length > 0 ? normalized : undefined
}

function normalizeAxis(value: unknown, fallbackCategories?: unknown) {
  const axis = isRecord(value) ? value : {}
  const categories = toStringArray(firstDefined(axis.categories, axis.labels, fallbackCategories))
  if (!categories) return undefined
  return {
    ...(toStringValue(firstDefined(axis.label, axis.title)) ? { label: toStringValue(firstDefined(axis.label, axis.title)) } : {}),
    categories,
    ...(toStringValue(firstDefined(axis.unit, axis.units)) ? { unit: toStringValue(firstDefined(axis.unit, axis.units)) } : {})
  }
}

function normalizeYAxis(value: unknown, fallbackUnits?: unknown) {
  const axis = isRecord(value) ? value : {}
  const label = toStringValue(firstDefined(axis.label, axis.title))
  const unit = toStringValue(firstDefined(axis.unit, axis.units, fallbackUnits))
  const min = typeof axis.min === 'number' && Number.isFinite(axis.min) ? axis.min : undefined
  const max = typeof axis.max === 'number' && Number.isFinite(axis.max) ? axis.max : undefined
  if (!label && !unit && min === undefined && max === undefined) return undefined
  return {
    ...(label ? { label } : {}),
    ...(unit ? { unit } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {})
  }
}

function generatedCategories(length: number) {
  return Array.from({ length }, (_, index) => `Category ${index + 1}`)
}

function normalizePieData(value: unknown, labelsValue?: unknown): z.infer<typeof Task1PieDataSchema>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const labels = toStringArray(labelsValue) || []
  const output = value.flatMap((item, index) => {
    if (isRecord(item)) {
      const rawValue = firstDefined(item.value, item.amount, item.percentage, item.data)
      const numericValue = rawValue === null ? null : Number(rawValue)
      if (numericValue !== null && !Number.isFinite(numericValue)) return []
      return [{
        label: toStringValue(firstDefined(item.label, item.name, item.category)) || labels[index] || `Category ${index + 1}`,
        value: numericValue
      }]
    }
    const numericValue = item === null ? null : Number(item)
    if (numericValue !== null && !Number.isFinite(numericValue)) return []
    return [{ label: labels[index] || `Category ${index + 1}`, value: numericValue }]
  })
  return output.length > 0 ? output : undefined
}

function normalizeTableData(value: unknown, fallbackColumns?: unknown, fallbackRows?: unknown) {
  const table = isRecord(value) ? value : {}
  const columns = toStringArray(firstDefined(table.columns, table.headers, table.labels, fallbackColumns))
  const rawRows = firstDefined(table.rows, table.data, fallbackRows)
  if (!columns || !Array.isArray(rawRows)) return undefined
  const rows = rawRows.filter(Array.isArray).map((row) =>
    row.map((cell) => cell === null ? null : typeof cell === 'number' ? cell : String(cell))
  )
  return rows.length > 0 ? { columns, rows } : undefined
}

function normalizeStandaloneChartCandidate(
  value: unknown,
  hint?: Task1StandaloneChartKind,
  fallbackTitle?: string
): Task1StandaloneChartSpec | null {
  if (!isRecord(value)) return null
  const chartType = normalizeStandaloneKind(firstDefined(value.chartType, value.kind, value.type), hint)
  if (!chartType) return null

  const units = toStringValue(firstDefined(value.units, value.unit, isRecord(value.yAxis) ? firstDefined(value.yAxis.unit, value.yAxis.units) : undefined)) || ''
  const title = toStringValue(firstDefined(value.title, value.name)) || fallbackTitle || `${chartType[0].toUpperCase()}${chartType.slice(1)} chart`
  const legend = typeof value.legend === 'boolean' ? value.legend : true
  const subtitle = toStringValue(value.subtitle)
  const source = toStringValue(value.source)

  let xAxis = normalizeAxis(value.xAxis, firstDefined(value.categories, value.labels))
  let series = normalizeSeries(firstDefined(value.series, value.datasets), chartType === 'line' || chartType === 'bar' ? chartType : undefined)
  let pieData = normalizePieData(firstDefined(value.pieData, chartType === 'pie' ? value.data : undefined), firstDefined(value.labels, value.categories))
  let tableData = normalizeTableData(firstDefined(value.tableData, chartType === 'table' ? value.data : undefined), value.columns, value.rows)

  if ((chartType === 'line' || chartType === 'bar') && !series) {
    const values = toNumberArray(firstDefined(value.values, value.data))
    if (values) {
      series = [{
        id: 'value',
        name: toStringValue(firstDefined(value.seriesName, value.label)) || 'Value',
        type: chartType,
        values
      }]
    }
  }

  if ((chartType === 'line' || chartType === 'bar') && series && !xAxis) {
    const length = series[0]?.values.length || 0
    if (length > 0 && series.every((item) => item.values.length === length)) {
      xAxis = { categories: generatedCategories(length) }
    }
  }

  if (chartType === 'pie' && !pieData && series?.[0]) {
    const labels = xAxis?.categories || generatedCategories(series[0].values.length)
    pieData = series[0].values.map((item, index) => ({ label: labels[index] || `Category ${index + 1}`, value: item }))
    series = undefined
    xAxis = undefined
  }

  if (chartType === 'table' && !tableData) {
    tableData = normalizeTableData(value, value.columns, value.rows)
  }

  const candidate = {
    chartType,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(xAxis ? { xAxis } : {}),
    ...(normalizeYAxis(value.yAxis, units) ? { yAxis: normalizeYAxis(value.yAxis, units) } : {}),
    ...(series ? { series } : {}),
    ...(pieData ? { pieData } : {}),
    ...(tableData ? { tableData } : {}),
    units,
    legend,
    ...(source ? { source } : {})
  }
  const parsed = Task1StandaloneChartSpecSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function mixedChartCandidates(spec: UnknownRecord) {
  const candidates: Array<{ value: unknown; hint?: Task1StandaloneChartKind }> = []

  if (Array.isArray(spec.charts)) {
    spec.charts.forEach((value) => candidates.push({ value }))
  }

  const namedCharts: Array<[string, Task1StandaloneChartKind]> = [
    ['barChart', 'bar'],
    ['barData', 'bar'],
    ['pieChart', 'pie'],
    ['pieData', 'pie'],
    ['lineChart', 'line'],
    ['lineData', 'line'],
    ['tableChart', 'table'],
    ['tableData', 'table']
  ]
  for (const [key, hint] of namedCharts) {
    if (isRecord(spec[key])) candidates.push({ value: spec[key], hint })
  }

  for (const key of ['leftChart', 'rightChart', 'chart1', 'chart2', 'firstChart', 'secondChart']) {
    if (isRecord(spec[key])) candidates.push({ value: spec[key] })
  }

  if (candidates.length === 0 && Array.isArray(spec.series)) {
    const normalized = normalizeSeries(spec.series)
    const barSeries = normalized?.filter((item) => item.type === 'bar') || []
    const lineSeries = normalized?.filter((item) => item.type === 'line') || []
    const shared = {
      xAxis: spec.xAxis,
      yAxis: spec.yAxis,
      units: firstDefined(spec.units, spec.unit),
      legend: spec.legend,
      source: spec.source
    }
    if (barSeries.length > 0) {
      candidates.push({
        hint: 'bar',
        value: { ...shared, title: `${toStringValue(spec.title) || 'Mixed chart'} — Bar chart`, series: barSeries }
      })
    }
    if (lineSeries.length > 0) {
      candidates.push({
        hint: 'line',
        value: { ...shared, title: `${toStringValue(spec.title) || 'Mixed chart'} — Line chart`, series: lineSeries }
      })
    }
  }

  return candidates
}

function standaloneValidationErrors(spec: Task1StandaloneChartSpec, path: string) {
  const errors: string[] = []
  if (spec.chartType === 'line' || spec.chartType === 'bar') {
    if (!spec.xAxis) errors.push(`${path}.xAxis is required`)
    if (!spec.series || spec.series.length === 0) errors.push(`${path}.series requires at least one series`)
    if (spec.xAxis && spec.series) {
      for (const series of spec.series) {
        if (series.values.length !== spec.xAxis.categories.length) {
          errors.push(`${path}.series "${series.name}" has ${series.values.length} values but ${spec.xAxis.categories.length} categories`)
        }
      }
    }
  }
  if (spec.chartType === 'pie' && (!spec.pieData || spec.pieData.length === 0)) {
    errors.push(`${path}.pieData is required`)
  }
  if (spec.chartType === 'table') {
    if (!spec.tableData) {
      errors.push(`${path}.tableData is required`)
    } else {
      spec.tableData.rows.forEach((row, index) => {
        if (row.length !== spec.tableData!.columns.length) {
          errors.push(`${path}.tableData row ${index} has ${row.length} cells but ${spec.tableData!.columns.length} columns`)
        }
      })
    }
  }
  return errors
}

export function normalizeTask1ChartSpec(spec: unknown, expectedKind?: Task1ChartKind): Task1ChartSpec | null {
  if (!isRecord(spec)) return null
  const inferredKind = expectedKind || (spec.kind === 'mixed' ? 'mixed' : normalizeStandaloneKind(firstDefined(spec.kind, spec.chartType, spec.type)))
  if (!inferredKind) return null

  if (inferredKind === 'mixed') {
    const title = toStringValue(spec.title) || 'Mixed charts'
    const charts = mixedChartCandidates(spec)
      .map((candidate, index) => normalizeStandaloneChartCandidate(candidate.value, candidate.hint, `${title} — Chart ${index + 1}`))
      .filter((chart): chart is Task1StandaloneChartSpec => chart !== null)
    const candidate = {
      kind: 'mixed' as const,
      title,
      ...(toStringValue(spec.subtitle) ? { subtitle: toStringValue(spec.subtitle) } : {}),
      charts,
      legend: typeof spec.legend === 'boolean' ? spec.legend : true,
      ...(toStringValue(spec.source) ? { source: toStringValue(spec.source) } : {})
    }
    const parsed = Task1ChartSpecSchema.safeParse(candidate)
    return parsed.success ? parsed.data : null
  }

  const standalone = normalizeStandaloneChartCandidate(spec, inferredKind)
  if (!standalone) return null
  const candidate: Task1ChartSpec = {
    kind: standalone.chartType,
    title: standalone.title,
    subtitle: standalone.subtitle,
    xAxis: standalone.xAxis,
    yAxis: standalone.yAxis,
    series: standalone.series,
    pieData: standalone.pieData,
    tableData: standalone.tableData,
    legend: standalone.legend,
    source: standalone.source
  }
  const parsed = Task1ChartSpecSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

export function prepareTask1ChartSpec(
  spec: unknown,
  expectedKind?: Task1ChartKind
): { success: true; data: Task1ChartSpec } | { success: false; errors: string[] } {
  const normalized = normalizeTask1ChartSpec(spec, expectedKind)
  if (!normalized) return { success: false, errors: ['Chart data could not be normalized into the canonical schema'] }
  const validation = validateChartSpec(normalized, expectedKind)
  return validation.valid
    ? { success: true, data: normalized }
    : { success: false, errors: validation.errors }
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

  if (data.kind === 'line' || data.kind === 'bar') {
    if (!data.xAxis) {
      errors.push('Chart requires xAxis categories')
    }
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
        if (!s.values.every(v => v === null || Number.isFinite(v))) {
          errors.push(`Series "${s.name}" contains non-finite values`)
        }
      }
    }
  }

  if (data.kind === 'mixed') {
    if (!data.charts || data.charts.length < 2) {
      errors.push('Mixed chart requires at least two independently renderable chart objects')
    } else {
      data.charts.forEach((chart, index) => {
        errors.push(...standaloneValidationErrors(chart, `charts.${index}`))
      })
    }
  }

  if (data.kind === 'pie') {
    if (!data.pieData || data.pieData.length === 0) {
      errors.push('Pie chart requires pieData')
    }
    if (data.pieData) {
      const knownValues = data.pieData.flatMap((item) => item.value === null ? [] : [item.value])
      const total = knownValues.reduce((sum, value) => sum + value, 0)
      if (knownValues.length === data.pieData.length && Math.abs(total - 100) > 5) {
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
  if (spec.charts) {
    seriesCount = spec.charts.reduce((sum, chart) => sum + (chart.series?.length || 0), 0)
    categoryCount = spec.charts.reduce((sum, chart) => sum + (chart.xAxis?.categories.length || chart.pieData?.length || chart.tableData?.rows.length || 0), 0)
    dataPointCount = spec.charts.reduce((sum, chart) => {
      if (chart.series) return sum + chart.series.reduce((seriesSum, series) => seriesSum + series.values.length, 0)
      if (chart.pieData) return sum + chart.pieData.length
      if (chart.tableData) return sum + chart.tableData.rows.length * chart.tableData.columns.length
      return sum
    }, 0)
  }

  return { chartKind: spec.kind, categoryCount, seriesCount, dataPointCount }
}

type VisualDataSpecs = {
  chartSpec?: Task1ChartSpec
  processSpec?: Task1ProcessSpec
  mapSpec?: Task1MapSpec
  questionType: string
}

export function convertVisualDataToSpecs(
  visualTypes: string[],
  visualData: Record<string, unknown> | null | undefined,
  title: string
): VisualDataSpecs {
  if (!visualData || !visualTypes.length) {
    return { questionType: visualTypes[0] || 'unknown' }
  }

  const primaryType = visualTypes[0]

  if (primaryType === 'table' && Array.isArray(visualData.columns) && Array.isArray(visualData.rows)) {
    return {
      questionType: 'table',
      chartSpec: {
        kind: 'table',
        title,
        tableData: {
          columns: visualData.columns as string[],
          rows: visualData.rows as (string | number | null)[][]
        }
      }
    }
  }

  if (primaryType === 'line_chart' || primaryType === 'line') {
    const years = visualData.years as number[] | undefined
    const seriesRaw = visualData.series_approximate || visualData.series || {}
    if (years && typeof seriesRaw === 'object') {
      const series = Object.entries(seriesRaw).map(([name, values]) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        type: 'line' as const,
        values: (values as number[]).map((v) => v ?? null)
      }))
      return {
        questionType: 'line_chart',
        chartSpec: {
          kind: 'line',
          title,
          xAxis: { categories: years.map(String), unit: '' },
          yAxis: { unit: (visualData.unit as string) || '' },
          series
        }
      }
    }
  }

  if (primaryType === 'bar_chart' || primaryType === 'bar') {
    const years = visualData.years as number[] | undefined
    const ageGroups = visualData.age_groups as string[] | undefined
    const categoriesApprox = visualData.categories_approximate as Record<string, number[]> | undefined
    const ageGroupsApprox = visualData.age_groups_approximate as Record<string, number[]> | undefined

    if (categoriesApprox && ageGroups) {
      const seriesNames = Object.keys(categoriesApprox)
      const xAxisLabels = ageGroups
      const series = seriesNames.map((name) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        type: 'bar' as const,
        values: categoriesApprox[name].map((v) => v ?? null)
      }))
      return {
        questionType: 'bar_chart',
        chartSpec: {
          kind: 'bar',
          title,
          xAxis: { categories: xAxisLabels, unit: '' },
          yAxis: { unit: (visualData.unit as string) || '' },
          series
        }
      }
    }

    if (ageGroupsApprox && years) {
      const seriesNames = Object.keys(ageGroupsApprox)
      const xAxisLabels = years.map(String)
      const series = seriesNames.map((name) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        type: 'bar' as const,
        values: ageGroupsApprox[name].map((v) => v ?? null)
      }))
      return {
        questionType: 'bar_chart',
        chartSpec: {
          kind: 'bar',
          title,
          xAxis: { categories: xAxisLabels, unit: '' },
          yAxis: { unit: (visualData.unit as string) || '' },
          series
        }
      }
    }
  }

  if (primaryType === 'pie_chart' || primaryType === 'pie' || primaryType === 'mixed' || primaryType === 'multiple_charts') {
    if (visualData.coffee_production || visualData.profit_distribution) {
      const pieFields = [
        { key: 'coffee_production', title: 'The Source of Coffee Production' },
        { key: 'coffee_consumption', title: 'The Consumption of Coffee' },
        { key: 'profit_distribution', title: 'The Profit Distribution' }
      ]
      const charts: Task1StandaloneChartSpec[] = []
      for (const field of pieFields) {
        const data = visualData[field.key] as Record<string, number> | undefined
        if (data) {
          charts.push({
            chartType: 'pie',
            title: field.title,
            units: '',
            legend: true,
            pieData: Object.entries(data).map(([label, value]) => ({ label, value }))
          })
        }
      }
      if (charts.length >= 2) {
        return {
          questionType: 'mixed_charts',
          chartSpec: { kind: 'mixed', title, charts }
        }
      }
    }

    const yearsData = visualData.years as Record<string, number[]> | undefined
    if (yearsData && Object.keys(yearsData).length > 1) {
      const yearKeys = Object.keys(yearsData)
      const categories = visualData.categories as string[] | undefined
      if (categories) {
        const charts: Task1StandaloneChartSpec[] = yearKeys.map((year) => ({
          chartType: 'pie' as const,
          title: year,
          units: '',
          legend: true,
          pieData: categories.map((cat, i) => ({
            label: cat,
            value: yearsData[year][i] ?? null
          }))
        }))
        return {
          questionType: 'mixed_charts',
          chartSpec: { kind: 'mixed', title, charts }
        }
      }
    }
  }

  if (primaryType === 'process_diagram' || primaryType === 'process') {
    const steps = visualData.steps as { step: number; name: string; details?: string }[] | undefined
    if (steps) {
      const stages = steps.map((s) => ({
        id: `step-${s.step}`,
        label: s.name,
        description: s.details
      }))
      const connections = steps.slice(0, -1).map((s, i) => ({
        from: `step-${s.step}`,
        to: `step-${steps[i + 1].step}`
      }))
      return {
        questionType: 'process',
        processSpec: {
          title,
          stages,
          connections
        }
      }
    }
  }

  if (primaryType === 'map') {
    // Fast path: visualData is already a complete MapSchemaV2 object
    // (stored directly in DB as task1_visual_data with dataVersion='map-v2' and panels[])
    if (
      visualData.dataVersion === 'map-v2' &&
      Array.isArray(visualData.panels) &&
      visualData.panels.length > 0
    ) {
      return {
        questionType: 'map',
        mapSpec: {
          title: (visualData.title as string) || title,
          dataVersion: 'map-v2',
          beforeLabel: (visualData.beforeLabel as string) || (visualData.panels[0] as Record<string, unknown>)?.title as string || 'Before',
          afterLabel: (visualData.afterLabel as string) || (visualData.panels[visualData.panels.length - 1] as Record<string, unknown>)?.title as string || 'After',
          panels: visualData.panels as Task1MapSpec['panels'],
          legend: visualData.legend as Task1MapSpec['legend'],
        },
      }
    }

    // Legacy path: visualData has period keys with string arrays
    const periods = Object.keys(visualData).filter((k) => Array.isArray(visualData[k]))
    if (periods.length >= 2) {
      // Convert to v2 format with panels
      const panels: MapPanel[] = periods.map((period, periodIndex) => {
        const items = visualData[period] as string[]
        const features: MapFeatureV2[] = items.map((item, itemIndex) => {
          const d = item.toLowerCase()
          let type: MapFeatureV2['type'] = 'building_row'
          let extra: Partial<MapFeatureV2> = {}

          if (d.includes('river') || d.includes('water')) {
            type = 'river'
            extra = { width: 100, height: 400 }
          } else if (d.includes('road') || d.includes('street')) {
            type = 'road'
            extra = { width: 520, height: 4, style: periodIndex === 0 ? 'current' : 'future' }
          } else if (d.includes('bridge')) {
            type = 'bridge'
            extra = { width: 90, height: 14 }
          } else if (d.includes('forest') || d.includes('tree') || d.includes('wood')) {
            type = 'forest'
            extra = { width: 120, height: 100, treeCount: 6 }
          } else if (d.includes('house') || d.includes('housing') || d.includes('residential')) {
            type = 'housing'
            extra = { rows: 2, columns: 3 }
          } else if (d.includes('car park') || d.includes('parking')) {
            type = 'car_park'
            extra = { width: 100, height: 70, label: item.slice(0, 20) }
          } else if (d.includes('church')) {
            type = 'church'
            extra = { planned: periodIndex > 0 }
          } else if (d.includes('path') || d.includes('footpath')) {
            type = 'footpath'
            extra = { style: 'future' }
          } else if (d.includes('ferry') || d.includes('dock') || d.includes('harbour')) {
            type = 'ferry'
            extra = { width: 25, height: 30 }
          }

          // Position based on directional keywords
          const pos = estimateMapPosition(item, itemIndex)
          const x = Math.round(pos.x * 5.2)
          const y = Math.round(pos.y * 4.8)

          return { type, x, y, ...extra }
        })

        return {
          id: `panel-${periodIndex}`,
          title: period,
          features,
        }
      })

      return {
        questionType: 'map',
        mapSpec: {
          title,
          dataVersion: 'map-v2',
          beforeLabel: periods[0],
          afterLabel: periods[periods.length - 1],
          panels,
        }
      }
    }
  }

  return { questionType: primaryType }
}

function estimateMapPosition(description: string, index: number): { x: number; y: number } {
  const d = description.toLowerCase()
  let x = 50
  let y = 50

  if (d.includes('northwest') || d.includes('nw')) { x = 25; y = 25 }
  else if (d.includes('northeast') || d.includes('ne')) { x = 75; y = 25 }
  else if (d.includes('southwest') || d.includes('sw')) { x = 25; y = 75 }
  else if (d.includes('southeast') || d.includes('se')) { x = 75; y = 75 }
  else if (d.includes('north') || d.includes('above')) { x = 50; y = 25 }
  else if (d.includes('south') || d.includes('below')) { x = 50; y = 75 }
  else if (d.includes('west') || d.includes('left')) { x = 25; y = 50 }
  else if (d.includes('east') || d.includes('right')) { x = 75; y = 50 }
  else if (d.includes('centre') || d.includes('center') || d.includes('middle')) { x = 50; y = 50 }

  x += (index % 3) * 8 - 8
  y += Math.floor(index / 3) * 6 - 6
  x = Math.max(10, Math.min(90, x))
  y = Math.max(10, Math.min(90, y))

  return { x, y }
}
