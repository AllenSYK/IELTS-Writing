export const WritingEditorDividerWidth = 10
export const WritingEditorTask1DefaultRatio = 58
export const WritingEditorDefaultRatio = 50
export const WritingEditorMinimumRatio = 38
export const WritingEditorMaximumRatio = 75
export const WritingEditorTask1MinimumWidth = 540
export const WritingEditorTask2MinimumWidth = 420
export const WritingEditorRightMinimumWidth = 380

type SplitLayoutOptions = {
  hasTaskVisuals: boolean
}

export function defaultWritingEditorSplitRatio({ hasTaskVisuals }: SplitLayoutOptions) {
  return hasTaskVisuals ? WritingEditorTask1DefaultRatio : WritingEditorDefaultRatio
}

export function getWritingEditorSplitBounds(containerWidth: number, { hasTaskVisuals }: SplitLayoutOptions) {
  const usableWidth = Math.max(1, containerWidth - WritingEditorDividerWidth)
  const preferredLeftMinimum = hasTaskVisuals
    ? WritingEditorTask1MinimumWidth
    : WritingEditorTask2MinimumWidth
  const pixelMaximumRatio = ((usableWidth - WritingEditorRightMinimumWidth) / usableWidth) * 100
  const maximum = Math.max(
    WritingEditorMinimumRatio,
    Math.min(WritingEditorMaximumRatio, pixelMaximumRatio)
  )
  const pixelMinimumRatio = (preferredLeftMinimum / usableWidth) * 100
  const minimum = Math.min(
    maximum,
    Math.max(WritingEditorMinimumRatio, pixelMinimumRatio)
  )

  return { minimum, maximum }
}

export function clampWritingEditorSplitRatio(
  ratio: number,
  containerWidth: number,
  options: SplitLayoutOptions
) {
  const fallback = defaultWritingEditorSplitRatio(options)
  const value = Number.isFinite(ratio) ? ratio : fallback
  const { minimum, maximum } = getWritingEditorSplitBounds(containerWidth, options)
  return Math.min(maximum, Math.max(minimum, value))
}

export function parseWritingEditorSplitRatio(value: string | null) {
  if (value === null || value.trim() === '') return null
  const ratio = Number(value)
  return Number.isFinite(ratio) ? ratio : null
}
