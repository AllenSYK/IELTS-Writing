import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  clampWritingEditorSplitRatio,
  defaultWritingEditorSplitRatio,
  getWritingEditorSplitBounds,
  parseWritingEditorSplitRatio,
  WritingEditorRightMinimumWidth,
  WritingEditorTask1DefaultRatio,
  WritingEditorTask1MinimumWidth
} from '../lib/writing-editor-layout'

const root = new URL('../', import.meta.url)

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8')
}

function styleBlock(css: string, selector: string) {
  const start = css.indexOf(selector)
  assert.notEqual(start, -1, `Missing CSS selector: ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

test('Task 1 visuals open with the wider 58 percent editor split', () => {
  assert.equal(defaultWritingEditorSplitRatio({ hasTaskVisuals: true }), WritingEditorTask1DefaultRatio)
  assert.equal(WritingEditorTask1DefaultRatio, 58)
  assert.equal(defaultWritingEditorSplitRatio({ hasTaskVisuals: false }), 50)
})

test('Task 1 split bounds preserve readable left and right pane widths', () => {
  for (const width of [1024, 1280, 1440]) {
    const usableWidth = width - 10
    const bounds = getWritingEditorSplitBounds(width, { hasTaskVisuals: true })
    assert.ok((bounds.minimum / 100) * usableWidth >= Math.min(WritingEditorTask1MinimumWidth, (bounds.maximum / 100) * usableWidth) - 0.01)
    assert.ok(((100 - bounds.maximum) / 100) * usableWidth >= WritingEditorRightMinimumWidth - 0.01)
  }
})

test('Stored split ratios are parsed safely and clamped for the current window', () => {
  assert.equal(parseWritingEditorSplitRatio('58'), 58)
  assert.equal(parseWritingEditorSplitRatio('not-a-number'), null)
  assert.equal(parseWritingEditorSplitRatio(null), null)
  const narrowStoredRatio = clampWritingEditorSplitRatio(20, 1440, { hasTaskVisuals: true })
  const wideStoredRatio = clampWritingEditorSplitRatio(90, 1440, { hasTaskVisuals: true })
  const bounds = getWritingEditorSplitBounds(1440, { hasTaskVisuals: true })
  assert.equal(narrowStoredRatio, bounds.minimum)
  assert.equal(wideStoredRatio, bounds.maximum)
})

test('Mixed charts use the visual container width instead of the browser viewport', async () => {
  const css = await source('app/globals.css')
  assert.match(css, /\.task1-visual\s*\{[\s\S]*?container:\s*task-visuals\s*\/\s*inline-size;/)
  const mixedGrid = styleBlock(css, '.task1-mixed-grid')
  assert.match(mixedGrid, /grid-template-columns:\s*minmax\(470px,\s*1fr\);/)
  assert.match(css, /@container task-visuals \(min-width:\s*900px\)[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/)
  assert.doesNotMatch(mixedGrid, /overflow-x:\s*auto;/)
})

test('Every chart title has a dedicated wrapping header above the canvas', async () => {
  const [line, bar, pie, table, mixed, css] = await Promise.all([
    source('components/task1/LineChartQuestion.tsx'),
    source('components/task1/BarChartQuestion.tsx'),
    source('components/task1/PieChartQuestion.tsx'),
    source('components/task1/TableQuestion.tsx'),
    source('components/task1/MixedChartQuestion.tsx'),
    source('app/globals.css')
  ])
  for (const chart of [line, bar, pie, table, mixed]) {
    assert.match(chart, /<header className="task1-chart-heading">/)
  }
  const titleBlock = styleBlock(css, '.task1-chart-title')
  assert.match(titleBlock, /overflow-wrap:\s*anywhere;/)
  assert.doesNotMatch(titleBlock, /text-overflow:\s*ellipsis;/)
})

test('Pie chart legend is HTML outside the Recharts canvas and stacks when narrow', async () => {
  const [pie, css] = await Promise.all([
    source('components/task1/PieChartQuestion.tsx'),
    source('app/globals.css')
  ])
  assert.match(pie, /<Task1Legend[\s\S]*?className="task1-pie-legend"/)
  assert.doesNotMatch(pie, /<Legend/)
  assert.match(pie, /outerRadius="78%"/)
  assert.match(css, /\.task1-pie-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/)
  assert.match(css, /@container task-pie \(min-width:\s*560px\)[\s\S]*?grid-template-columns:\s*minmax\(280px,\s*1fr\)\s*minmax\(170px,\s*0\.65fr\);/)
})

test('Line and bar legends no longer consume coordinate-system space', async () => {
  const [line, bar, css] = await Promise.all([
    source('components/task1/LineChartQuestion.tsx'),
    source('components/task1/BarChartQuestion.tsx'),
    source('app/globals.css')
  ])
  for (const chart of [line, bar]) {
    assert.match(chart, /<Task1Legend/)
    assert.doesNotMatch(chart, /<Legend/)
    assert.match(chart, /width=\{64\}/)
    assert.match(chart, /className="task1-axis-caption task1-axis-caption-y"/)
  }
  assert.match(css, /\.task1-cartesian-canvas\s*\{[\s\S]*?height:\s*350px;/)
})

test('Task 1 tables rely on the one outer visual scroll region', async () => {
  const [visual, css] = await Promise.all([
    source('components/task1/Task1Visual.tsx'),
    source('app/globals.css')
  ])
  assert.match(visual, /className="task1-visual-scroll-region"/)
  assert.match(styleBlock(css, '.task1-visual-scroll-region'), /overflow-x:\s*auto;/)
  const tableContainer = styleBlock(css, '.task1-table-container')
  assert.match(tableContainer, /overflow:\s*visible;/)
  assert.doesNotMatch(tableContainer, /overflow-x:\s*auto;/)
  assert.match(css, /\.task1-table\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*100%;/)
})

test('Wide tables keep readable headers and a wider first column', async () => {
  const css = await source('app/globals.css')
  assert.match(css, /\.task1-table th\s*\{[\s\S]*?min-width:\s*112px;[\s\S]*?word-break:\s*keep-all;/)
  assert.match(css, /\.task1-table-label\s*\{[\s\S]*?min-width:\s*160px;/)
})

test('Overflow affordances update through a throttled ResizeObserver', async () => {
  const visual = await source('components/task1/Task1Visual.tsx')
  assert.match(visual, /new ResizeObserver\(measure\)/)
  assert.match(visual, /window\.requestAnimationFrame/)
  assert.match(visual, /can-scroll-left/)
  assert.match(visual, /can-scroll-right/)
  assert.match(visual, /左右滑动查看完整图表/)
})

test('The divider supports pointer, keyboard, accessibility, and selection locking', async () => {
  const [page, css] = await Promise.all([
    source('app/write/[mode]/page.tsx'),
    source('app/globals.css')
  ])
  assert.match(page, /role="separator"/)
  assert.match(page, /aria-orientation="vertical"/)
  assert.match(page, /aria-valuenow=\{Math\.round\(splitWidth\)\}/)
  assert.match(page, /event\.key === 'ArrowLeft' \|\| event\.key === 'ArrowRight'/)
  assert.match(page, /window\.requestAnimationFrame\(applyPosition\)/)
  assert.match(page, /document\.body\.classList\.add\('is-resizing-editor'\)/)
  assert.match(css, /body\.is-resizing-editor[\s\S]*?user-select:\s*none\s*!important;/)
})

test('Editor split persistence stores a ratio and migrates the legacy preference', async () => {
  const page = await source('app/write/[mode]/page.tsx')
  assert.match(page, /writingEditorSplitRatio-\$\{mode\}/)
  assert.match(page, /ielts-writing-editor-split-\$\{mode\}/)
  assert.match(page, /window\.localStorage\.setItem\(splitKey,\s*String\(next\)\)/)
})

test('Mobile writing layout stacks panes and removes the vertical divider', async () => {
  const css = await source('app/globals.css')
  assert.match(css, /@media \(max-width:\s*920px\)[\s\S]*?\.exam-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
  assert.match(css, /@media \(max-width:\s*920px\)[\s\S]*?\.resizer-handle\s*\{[\s\S]*?display:\s*none;/)
  assert.match(css, /@media \(max-width:\s*920px\)[\s\S]*?\.exam-left-pane,[\s\S]*?\.exam-right-pane\s*\{[\s\S]*?width:\s*100%;/)
})

test('Uploaded source images stay outside the reconstructed chart grid', async () => {
  const page = await source('app/write/[mode]/page.tsx')
  assert.match(page, /<details className="exam-original-image">/)
  assert.match(page, /<summary>查看原始图片<\/summary>/)
  assert.match(page, /部分图表数据未能完全复原，请同时参考原始图片/)
})

test('The editor frame no longer creates a clipped vertical chart viewport', async () => {
  const css = await source('app/globals.css')
  const graphFrame = styleBlock(css, '.exam-graph-frame')
  assert.match(graphFrame, /overflow:\s*visible;/)
  assert.doesNotMatch(graphFrame, /max-height:\s*400px;/)
  assert.match(css, /\.exam-left-inner\s*\{[\s\S]*?max-width:\s*1120px;/)
})
