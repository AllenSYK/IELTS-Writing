import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DraftLimitErrorCodes,
  DraftLimits,
  draftRemainingSeconds,
  draftTotalWords,
  initialManagedDraft,
  managedDraftHasContent,
  normalizeManagedDraftData,
  type DraftRecord
} from '../lib/writing-drafts'
import { DefaultPromptSelection } from '../lib/writing-options'

test('draft limits distinguish Task 1, Task 2, and a complete test', () => {
  assert.deepEqual(DraftLimits, { task1: 5, task2: 5, mock: 3 })
  assert.equal(DraftLimitErrorCodes.task1, 'DRAFT_LIMIT_REACHED_TASK1')
  assert.equal(DraftLimitErrorCodes.task2, 'DRAFT_LIMIT_REACHED_TASK2')
  assert.equal(DraftLimitErrorCodes.mock, 'DRAFT_LIMIT_REACHED_FULL_TEST')
})

test('full-test drafts keep two independent responses, one active task, and one timer', () => {
  const draft = initialManagedDraft('mock', {
    ...DefaultPromptSelection,
    task1ChartType: 'bar_chart',
    task2EssayType: 'agree_disagree',
    task2Topic: 'education'
  })
  assert.equal(draft.kind, 'full_test')
  if (draft.kind !== 'full_test') return
  assert.equal(draft.activeTask, 'task1')
  assert.equal(draft.remainingSeconds, 3600)
  assert.equal(draft.task1.essay, '')
  assert.equal(draft.task2.essay, '')
  assert.equal(draft.selection.task1ChartType, 'bar_chart')
  assert.equal(draft.selection.task2EssayType, 'agree_disagree')
  assert.equal(draft.selection.task2Topic, 'education')
})

test('empty writing sessions do not become visible drafts until the user writes content', () => {
  const single = initialManagedDraft('task1')
  const fullTest = initialManagedDraft('mock')

  assert.equal(managedDraftHasContent(single, 'task1'), false)
  assert.equal(managedDraftHasContent(fullTest, 'mock'), false)

  if (single.kind === 'single') single.task.essay = '  A real response.  '
  if (fullTest.kind === 'full_test') fullTest.task2.essay = 'Task 2 content'

  assert.equal(managedDraftHasContent(single, 'task1'), true)
  assert.equal(managedDraftHasContent(fullTest, 'mock'), true)
})

test('draft display totals add both full-test tasks and never return negative time', () => {
  const data = initialManagedDraft('mock')
  assert.equal(data.kind, 'full_test')
  if (data.kind !== 'full_test') return
  data.task1.wordCount = 151
  data.task2.wordCount = 263
  data.remainingSeconds = 0
  const record: DraftRecord = {
    id: 'draft-test',
    taskType: 'mock',
    draftData: data,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z'
  }
  assert.equal(draftTotalWords(record), 414)
  assert.equal(draftRemainingSeconds(record), 0)
})

test('legacy single-task drafts normalize into managed user drafts', () => {
  const normalized = normalizeManagedDraftData({
    essay: 'A legacy response',
    updatedAt: '2026-06-21T00:00:00.000Z',
    wordCount: 3,
    questionType: 'agree_disagree'
  }, 'task2')
  assert.equal(normalized?.kind, 'single')
  if (normalized?.kind !== 'single') return
  assert.equal(normalized.task.essay, 'A legacy response')
  assert.equal(normalized.remainingSeconds, 2400)
})

test('draft API authenticates users and delegates limits and deletion to atomic RPC functions', async () => {
  const [route, migration] = await Promise.all([
    readFile(new URL('../app/api/user/writing-drafts/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260621100700_draft_limits_and_full_test_drafts.sql', import.meta.url), 'utf8')
  ])

  assert.match(route, /getCurrentSupabaseUser\(\)/)
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /\.rpc\('create_writing_draft'/)
  assert.match(route, /\.rpc\('update_writing_draft'/)
  assert.match(route, /\.rpc\('delete_writing_draft'/)
  // complete_writing_draft RPC 已移除，改为直接删除草稿
  assert.doesNotMatch(route, /\.rpc\('complete_writing_draft'/)
  assert.match(route, /\.from\('writing_drafts'\)[\s\S]*?\.delete\(\)/)

  assert.match(migration, /pg_advisory_xact_lock/i)
  assert.match(migration, /case when p_task_type = 'mock' then 3 else 5 end/i)
  assert.match(migration, /DAILY_DRAFT_DELETE_LIMIT_REACHED/)
  assert.match(migration, /timezone\('Asia\/Shanghai'/)
  assert.match(migration, /create table if not exists public\.draft_deletion_events/i)
  assert.match(migration, /alter table public\.draft_deletion_events enable row level security/i)
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i)
  assert.match(migration, /revoke insert, update, delete on public\.writing_drafts from authenticated/i)
})

test('practice page exposes a centered draft manager and complete-test configuration', async () => {
  const [selector, manager, editor, history, loading, css] = await Promise.all([
    readFile(new URL('../components/practice/WritingModeSelector.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/practice/DraftManager.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/write/[mode]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/history/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/loading/PageSkeleton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(selector, /<DraftManager/)
  assert.match(selector, /createManagedDraft\(mode, selection, requestId, controller\.signal\)/)
  assert.match(selector, /Task 1 题型/)
  assert.match(selector, /Task 2 题型/)
  assert.match(selector, /Task 2 主题/)
  assert.match(manager, /CenteredDialog/)
  assert.match(manager, /草稿记录/)
  assert.match(manager, /今日还可删除/)
  assert.match(manager, /继续写作/)
  assert.match(manager, /确认删除/)
  assert.match(manager, /draft-loading-spinner/)
  assert.match(manager, /ielts-writing:practice-visited/)
  assert.match(selector, /确认开始/)
  assert.match(selector, /practice-launch-progress/)
  assert.match(loading, /正在准备写作练习/)
  assert.match(css, /\.draft-loading-spinner\s*\{[\s\S]*?animation:/)
  assert.match(css, /\.writing-route-progress span\s*\{[\s\S]*?animation:/)
  assert.match(editor, /kind: 'full_test'/)
  assert.match(editor, /activeTask:/)
  assert.doesNotMatch(editor, /总计：\{totalMockWords\}\/400/)
  assert.match(editor, /className="result-tabs full-test-tabs"/)
  assert.match(editor, /Task 1：\{mockTask1Label\}/)
  assert.match(editor, /Task 2：\{mockTask2Label\}/)
  assert.doesNotMatch(editor, /Total \{totalMockWords\}\/400 words/)
  assert.match(history, /<option value="newest">最新优先<\/option>/)
  assert.match(history, /<option value="oldest">最早优先<\/option>/)
})
