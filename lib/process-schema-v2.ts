import { z } from 'zod'

const PROCESS_V2_VERSION = 'process-v2' as const
const MAX_TITLE_LENGTH = 55
const MAX_STEP_TITLE_LENGTH = 30
const MAX_DESCRIPTION_LENGTH = 90
const MIN_STEPS = 3
const MAX_STEPS = 10
const REPAIR_MAX_ROUNDS = 2

const ALLOWED_ICONS = new Set([
  'harvest', 'filter', 'store', 'treat', 'supply', 'collect', 'sort', 'clean',
  'shred', 'melt', 'produce', 'dig', 'mix', 'mould', 'dry', 'cool', 'pack',
  'test', 'ship', 'inspect', 'heat', 'cool', 'grind', 'wash', 'cut', 'assemble',
  'package', 'deliver', 'recycle', 'process', 'prepare', 'begin', 'end'
])

export const ProcessOrientationSchema = z.enum(['horizontal', 'vertical', 'auto'])
export type ProcessOrientation = z.infer<typeof ProcessOrientationSchema>

export const ProcessStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_STEP_TITLE_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  icon: z.string().optional(),
  phase: z.string().optional()
})
export type ProcessStep = z.infer<typeof ProcessStepSchema>

export const ProcessConnectionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional()
})
export type ProcessConnection = z.infer<typeof ProcessConnectionSchema>

export const ProcessSchemaV2 = z.object({
  dataVersion: z.literal(PROCESS_V2_VERSION),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  orientation: ProcessOrientationSchema.default('auto'),
  isCyclic: z.boolean().default(false),
  steps: z.array(ProcessStepSchema).min(MIN_STEPS).max(MAX_STEPS),
  connections: z.array(ProcessConnectionSchema).optional(),
  startLabel: z.string().optional(),
  endLabel: z.string().optional()
})
export type ProcessV2 = z.infer<typeof ProcessSchemaV2>

export type ProcessValidationErrorCode =
  | 'PROCESS_TOO_FEW_STEPS'
  | 'PROCESS_TOO_MANY_STEPS'
  | 'PROCESS_DUPLICATE_STEP_ID'
  | 'PROCESS_INVALID_CONNECTION'
  | 'PROCESS_TEXT_TOO_LONG'
  | 'PROCESS_UNSUPPORTED_ICON'
  | 'PROCESS_INVALID_CYCLE'
  | 'PROCESS_INVALID_SCHEMA'

export type ProcessValidationError = {
  code: ProcessValidationErrorCode
  message: string
  path?: string
}

export type ProcessValidationResult =
  | { valid: true; data: ProcessV2 }
  | { valid: false; errors: ProcessValidationError[] }

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

function sanitizeText(text: string): string {
  return stripHtml(stripMarkdown(text))
}

function truncate(text: string, maxLength: number): string {
  const clean = sanitizeText(text)
  if (clean.length <= maxLength) return clean
  return clean.slice(0, maxLength - 1).trimEnd() + '…'
}

function generateStepId(index: number, existingIds: Set<string>): string {
  const base = `step-${index + 1}`
  let candidate = base
  let counter = 2
  while (existingIds.has(candidate)) {
    candidate = `${base}-${counter}`
    counter++
  }
  return candidate
}

function isValidIcon(icon: unknown): icon is string {
  return typeof icon === 'string' && ALLOWED_ICONS.has(icon)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeProcessSpec(input: unknown): ProcessV2 | null {
  if (!isRecord(input)) return null

  const raw = input as Record<string, unknown>
  const dataVersion = raw.dataVersion === PROCESS_V2_VERSION ? PROCESS_V2_VERSION : PROCESS_V2_VERSION

  const title = toStringValue(raw.title)
  const orientation = normalizeOrientation(raw.orientation)
  const isCyclic = typeof raw.isCyclic === 'boolean' ? raw.isCyclic : false

  const rawSteps = Array.isArray(raw.steps) ? raw.steps
    : Array.isArray(raw.stages) ? raw.stages
    : Array.isArray(raw.nodes) ? raw.nodes
    : []

  const existingIds = new Set<string>()
  const steps: ProcessStep[] = []

  for (let i = 0; i < rawSteps.length; i++) {
    const rawStep = rawSteps[i]
    if (!isRecord(rawStep)) continue

    const rawId = toStringValue(rawStep.id) || toStringValue(rawStep.stepId) || generateStepId(i, existingIds)
    let id = rawId
    if (existingIds.has(id)) {
      id = generateStepId(i, existingIds)
    }
    existingIds.add(id)

    const rawTitle = toStringValue(rawStep.title) || toStringValue(rawStep.label) || toStringValue(rawStep.name)
    if (!rawTitle) continue
    const stepTitle = truncate(rawTitle, MAX_STEP_TITLE_LENGTH)

    const rawDesc = toStringValue(rawStep.description) || toStringValue(rawStep.details) || toStringValue(rawStep.text)
    const description = rawDesc ? truncate(rawDesc, MAX_DESCRIPTION_LENGTH) : undefined

    const icon = isValidIcon(rawStep.icon) ? rawStep.icon : undefined
    const phase = toStringValue(rawStep.phase)

    steps.push({
      id,
      title: stepTitle,
      ...(description ? { description } : {}),
      ...(icon ? { icon } : {}),
      ...(phase ? { phase } : {})
    })
  }

  if (steps.length < MIN_STEPS) return null
  if (steps.length > MAX_STEPS) {
    steps.length = MAX_STEPS
  }

  const connections = normalizeConnections(raw.connections, steps, isCyclic)
  const startLabel = toStringValue(raw.startLabel)
  const endLabel = toStringValue(raw.endLabel)

  const candidate: ProcessV2 = {
    dataVersion,
    orientation,
    isCyclic,
    steps,
    ...(title ? { title: truncate(title, MAX_TITLE_LENGTH) } : {}),
    ...(connections.length > 0 ? { connections } : {}),
    ...(startLabel ? { startLabel } : {}),
    ...(endLabel ? { endLabel } : {})
  }

  const parsed = ProcessSchemaV2.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function normalizeOrientation(value: unknown): ProcessOrientation {
  if (typeof value !== 'string') return 'auto'
  const lower = value.toLowerCase().trim()
  if (lower === 'horizontal' || lower === 'h') return 'horizontal'
  if (lower === 'vertical' || lower === 'v') return 'vertical'
  return 'auto'
}

function normalizeConnections(
  rawConnections: unknown,
  steps: ProcessStep[],
  isCyclic: boolean
): ProcessConnection[] {
  const stepIds = new Set(steps.map(s => s.id))
  const validConnections: ProcessConnection[] = []

  if (Array.isArray(rawConnections)) {
    for (const conn of rawConnections) {
      if (!isRecord(conn)) continue
      const from = toStringValue(conn.from)
      const to = toStringValue(conn.to)
      if (!from || !to) continue
      if (!stepIds.has(from) || !stepIds.has(to)) continue
      if (from === to) continue
      const label = toStringValue(conn.label)
      validConnections.push({
        from,
        to,
        ...(label ? { label } : {})
      })
    }
  }

  if (validConnections.length === 0) {
    for (let i = 0; i < steps.length - 1; i++) {
      validConnections.push({ from: steps[i].id, to: steps[i + 1].id })
    }
    if (isCyclic && steps.length >= 2) {
      validConnections.push({ from: steps[steps.length - 1].id, to: steps[0].id })
    }
  }

  return validConnections
}

export function validateProcessSchemaV2(data: unknown): ProcessValidationResult {
  const errors: ProcessValidationError[] = []

  if (!isRecord(data)) {
    return { valid: false, errors: [{ code: 'PROCESS_INVALID_SCHEMA', message: 'Input is not an object' }] }
  }

  const parsed = ProcessSchemaV2.safeParse(data)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.')
      if (path.includes('steps') && issue.message.includes('too small')) {
        errors.push({ code: 'PROCESS_TOO_FEW_STEPS', message: `At least ${MIN_STEPS} steps required`, path })
      } else if (path.includes('steps') && issue.message.includes('too large')) {
        errors.push({ code: 'PROCESS_TOO_MANY_STEPS', message: `At most ${MAX_STEPS} steps allowed`, path })
      } else {
        errors.push({ code: 'PROCESS_INVALID_SCHEMA', message: `${path}: ${issue.message}`, path })
      }
    }
    if (errors.length > 0) {
      return { valid: false, errors }
    }
  }

  const d = parsed.data ?? (data as ProcessV2)

  const stepIds = new Set<string>()
  for (const step of d.steps) {
    if (stepIds.has(step.id)) {
      errors.push({ code: 'PROCESS_DUPLICATE_STEP_ID', message: `Duplicate step id: ${step.id}` })
    }
    stepIds.add(step.id)

    if (step.title.length > MAX_STEP_TITLE_LENGTH) {
      errors.push({ code: 'PROCESS_TEXT_TOO_LONG', message: `Step "${step.id}" title exceeds ${MAX_STEP_TITLE_LENGTH} chars`, path: `steps.${step.id}.title` })
    }
    if (step.description && step.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({ code: 'PROCESS_TEXT_TOO_LONG', message: `Step "${step.id}" description exceeds ${MAX_DESCRIPTION_LENGTH} chars`, path: `steps.${step.id}.description` })
    }
    if (step.icon && !ALLOWED_ICONS.has(step.icon)) {
      errors.push({ code: 'PROCESS_UNSUPPORTED_ICON', message: `Unsupported icon: ${step.icon}`, path: `steps.${step.id}.icon` })
    }
  }

  if (d.title && d.title.length > MAX_TITLE_LENGTH) {
    errors.push({ code: 'PROCESS_TEXT_TOO_LONG', message: `Title exceeds ${MAX_TITLE_LENGTH} chars`, path: 'title' })
  }

  if (d.connections) {
    for (const conn of d.connections) {
      if (!stepIds.has(conn.from)) {
        errors.push({ code: 'PROCESS_INVALID_CONNECTION', message: `Connection references non-existent step: ${conn.from}`, path: `connections.${conn.from}->${conn.to}` })
      }
      if (!stepIds.has(conn.to)) {
        errors.push({ code: 'PROCESS_INVALID_CONNECTION', message: `Connection references non-existent step: ${conn.to}`, path: `connections.${conn.from}->${conn.to}` })
      }
    }

    if (!d.isCyclic) {
      const hasCycle = d.connections.some(c => {
        const fromIdx = d.steps.findIndex(s => s.id === c.from)
        const toIdx = d.steps.findIndex(s => s.id === c.to)
        return toIdx < fromIdx
      })
      if (hasCycle) {
        errors.push({ code: 'PROCESS_INVALID_CYCLE', message: 'Non-cyclic process has backward connection' })
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, data: d }
}

export function repairProcessSpec(input: unknown): ProcessV2 | null {
  let current = normalizeProcessSpec(input)
  if (!current) return null

  for (let round = 0; round < REPAIR_MAX_ROUNDS; round++) {
    const validation = validateProcessSchemaV2(current)
    if (validation.valid) return validation.data

    let repaired: ProcessV2 = { ...current }
    const steps = [...repaired.steps]

    for (const error of validation.errors) {
      switch (error.code) {
        case 'PROCESS_DUPLICATE_STEP_ID': {
          const seen = new Set<string>()
          for (let i = 0; i < steps.length; i++) {
            if (seen.has(steps[i].id)) {
              steps[i] = { ...steps[i], id: generateStepId(i, seen) }
            }
            seen.add(steps[i].id)
          }
          break
        }
        case 'PROCESS_TEXT_TOO_LONG': {
          if (repaired.title && repaired.title.length > MAX_TITLE_LENGTH) {
            repaired = { ...repaired, title: truncate(repaired.title, MAX_TITLE_LENGTH) }
          }
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            const updates: Partial<ProcessStep> = {}
            if (step.title.length > MAX_STEP_TITLE_LENGTH) {
              updates.title = truncate(step.title, MAX_STEP_TITLE_LENGTH)
            }
            if (step.description && step.description.length > MAX_DESCRIPTION_LENGTH) {
              updates.description = truncate(step.description, MAX_DESCRIPTION_LENGTH)
            }
            if (Object.keys(updates).length > 0) {
              steps[i] = { ...step, ...updates }
            }
          }
          break
        }
        case 'PROCESS_UNSUPPORTED_ICON': {
          for (let i = 0; i < steps.length; i++) {
            if (steps[i].icon && !ALLOWED_ICONS.has(steps[i].icon as string)) {
              steps[i] = { ...steps[i], icon: undefined }
            }
          }
          break
        }
        case 'PROCESS_INVALID_CONNECTION': {
          const stepIds = new Set(steps.map(s => s.id))
          if (repaired.connections) {
            repaired = {
              ...repaired,
              connections: repaired.connections.filter((c: ProcessConnection) => stepIds.has(c.from) && stepIds.has(c.to))
            }
          }
          break
        }
        case 'PROCESS_INVALID_CYCLE': {
          if (repaired.connections) {
            const stepOrder = new Map(steps.map((s, i) => [s.id, i]))
            repaired = {
              ...repaired,
              connections: repaired.connections.filter((c: ProcessConnection) => {
                const fromIdx = stepOrder.get(c.from) ?? 0
                const toIdx = stepOrder.get(c.to) ?? 0
                return toIdx >= fromIdx
              })
            }
          }
          break
        }
        case 'PROCESS_TOO_MANY_STEPS': {
          steps.length = MAX_STEPS
          break
        }
      }
    }

    repaired = { ...repaired, steps }

    if (repaired.connections && repaired.connections.length === 0 && steps.length >= MIN_STEPS) {
      const newConnections: ProcessConnection[] = []
      for (let i = 0; i < steps.length - 1; i++) {
        newConnections.push({ from: steps[i].id, to: steps[i + 1].id })
      }
      if (repaired.isCyclic && steps.length >= 2) {
        newConnections.push({ from: steps[steps.length - 1].id, to: steps[0].id })
      }
      repaired = { ...repaired, connections: newConnections }
    }

    current = repaired
  }

  const finalValidation = validateProcessSchemaV2(current)
  return finalValidation.valid ? finalValidation.data : null
}

export function legacyProcessToV2(input: unknown): ProcessV2 | null {
  if (!isRecord(input)) return null

  const raw = input as Record<string, unknown>

  if (raw.dataVersion === PROCESS_V2_VERSION) {
    return normalizeProcessSpec(raw)
  }

  const stages = Array.isArray(raw.stages) ? raw.stages : undefined
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : undefined
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : stages || nodes

  if (!stepsRaw || stepsRaw.length === 0) return null

  const adapted = {
    dataVersion: PROCESS_V2_VERSION,
    title: raw.title,
    orientation: raw.orientation ?? 'auto',
    isCyclic: raw.isCyclic ?? false,
    steps: stepsRaw.map((s: unknown, i: number) => {
      if (!isRecord(s)) return { id: `step-${i + 1}`, title: String(s) }
      return {
        id: toStringValue(s.id) || toStringValue(s.stepId) || `step-${i + 1}`,
        title: toStringValue(s.title) || toStringValue(s.label) || toStringValue(s.name) || `Step ${i + 1}`,
        description: toStringValue(s.description) || toStringValue(s.details) || toStringValue(s.text),
        icon: isValidIcon(s.icon) ? s.icon : undefined,
        phase: toStringValue(s.phase)
      }
    }),
    connections: Array.isArray(raw.connections) ? raw.connections : undefined,
    startLabel: toStringValue(raw.startLabel),
    endLabel: toStringValue(raw.endLabel)
  }

  return normalizeProcessSpec(adapted)
}

export function prepareProcessSpec(
  input: unknown
): { success: true; data: ProcessV2 } | { success: false; errors: ProcessValidationError[] } {
  const normalized = normalizeProcessSpec(input)
  if (!normalized) {
    return {
      success: false,
      errors: [{ code: 'PROCESS_INVALID_SCHEMA', message: 'Could not normalize input into process-v2 schema' }]
    }
  }

  const validation = validateProcessSchemaV2(normalized)
  if (validation.valid) return { success: true, data: validation.data }

  const repaired = repairProcessSpec(normalized)
  if (!repaired) {
    return { success: false, errors: validation.errors }
  }

  return { success: true, data: repaired }
}

export function getProcessFallback(): ProcessV2 {
  return {
    dataVersion: PROCESS_V2_VERSION,
    title: 'Recycling Process',
    orientation: 'auto',
    isCyclic: false,
    steps: [
      { id: 'collect', title: 'Collection', description: 'Materials are gathered from collection points.' },
      { id: 'sort', title: 'Sorting', description: 'Materials are sorted by type and quality.' },
      { id: 'process', title: 'Processing', description: 'Sorted materials are cleaned and processed.' },
      { id: 'manufacture', title: 'Manufacturing', description: 'Processed materials are used to make new products.' },
      { id: 'distribute', title: 'Distribution', description: 'New products are distributed to retailers.' }
    ]
  }
}

export const PROCESS_CONSTANTS = {
  PROCESS_V2_VERSION,
  MAX_TITLE_LENGTH,
  MAX_STEP_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MIN_STEPS,
  MAX_STEPS,
  ALLOWED_ICONS
} as const
