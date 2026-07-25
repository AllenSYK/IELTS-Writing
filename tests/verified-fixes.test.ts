import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildNormalizedKey, normalizeErrorCategory } from '../lib/error-extraction'
import { pastPaperPracticeReadiness } from '../lib/past-paper-readiness'
import { buildLiveStudyPlanAnalysis } from '../lib/study-plan-live-analysis'

test('incomplete fixed questions are rejected before they enter writing practice', () => {
  assert.deepEqual(
    pastPaperPracticeReadiness({
      taskType: 'task1_academic',
      questionText: 'The chart below shows changes in household energy use over time.',
      task1VisualTypes: ['bar'],
      task1VisualData: null
    }).code,
    'TASK1_VISUAL_MISSING'
  )
  assert.deepEqual(
    pastPaperPracticeReadiness({
      taskType: 'task2',
      questionText: 'Plant and animal diversity is declining around the world.'
    }).code,
    'TASK2_DIRECTIVE_MISSING'
  )
  assert.equal(
    pastPaperPracticeReadiness({
      taskType: 'task2',
      questionText: 'Plant and animal diversity is declining around the world. What are the causes and possible solutions?'
    }).ready,
    true
  )
})

test('error categories and duplicate signatures use one canonical vocabulary', () => {
  assert.equal(normalizeErrorCategory('vocabulary'), 'word_choice')
  assert.equal(normalizeErrorCategory('用词'), 'word_choice')
  assert.equal(normalizeErrorCategory('sentence-structure'), 'sentence_structure')
  assert.equal(normalizeErrorCategory('spelling'), 'spelling')

  const first = buildNormalizedKey('word_choice', 'vocabulary', 'make a progress', 'make progress')
  const second = buildNormalizedKey('word_choice', '用词', 'make a progress', 'make progress')
  assert.equal(first, second)
})

test('live study-plan analysis uses newest completed record and IELTS half-band rounding', () => {
  const result = buildLiveStudyPlanAnalysis([
    {
      task_type: 'task2',
      submitted_at: '2026-07-02T10:00:00.000Z',
      evaluation: { overallBand: '5.5' }
    },
    {
      task_type: 'task1',
      submitted_at: '2026-07-05T10:00:00.000Z',
      evaluation: { overallBand: '8.0' }
    }
  ], null, new Date('2026-07-06T00:00:00.000Z'))

  assert.equal(result.scores.latest, 8)
  assert.equal(result.scores.overall, 7)
  assert.equal(result.recordCount, 2)
  assert.equal(buildLiveStudyPlanAnalysis([], 6.5).scores.overall, 6.5)
})

test('verified UI fixes expose a mobile navigation and the correct draft-limit tab', async () => {
  const [sidebar, practicePage, editor, analyticsRoute, activity] = await Promise.all([
    readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/practice/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/write/[mode]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/user/writing-records/analytics/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/writing-activity.ts', import.meta.url), 'utf8')
  ])

  assert.match(sidebar, /sidebar-mobile-menu/)
  assert.match(sidebar, /aria-controls="mobile-main-navigation"/)
  assert.match(practicePage, /draftTab/)
  assert.match(editor, /DRAFT_LIMIT_REACHED_TASK2/)
  assert.match(analyticsRoute, /'partial'/)
  assert.match(analyticsRoute, /submitted_at', \{ ascending: false \}/)
  assert.match(activity, /\.from\('writing_records'\)/)
  assert.doesNotMatch(activity, /\.from\('usage_records'\)/)
})
