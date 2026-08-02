import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  WritingRecordsStorageKey,
  loadWritingRecords,
  saveWritingRecord,
  type WritingRecord
} from '../lib/writing-records'
import {
  UserRouteCacheKeys,
  userWritingRecordListCacheKey,
  userWritingRecordsCacheKey
} from '../lib/user-route-cache'
import {
  clearUserEphemeralBrowserState,
  userScopedStorageKey
} from '../lib/user-storage'
import { buildWritingActivity } from '../lib/writing-activity'

class MemoryStorage {
  [key: string]: unknown

  constructor() {
    Object.defineProperty(this, 'values', {
      value: new Map<string, string>(),
      enumerable: false,
      writable: false
    })
  }

  private get values() {
    return new Map<string, string>()
  }

  get length() {
    return this.values.size
  }

  clear() {
    for (const key of this.values.keys()) this.removeItem(key)
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
    delete this[key]
  }

  setItem(key: string, value: string) {
    const normalized = String(value)
    this.values.set(key, normalized)
    Object.defineProperty(this, key, {
      configurable: true,
      enumerable: true,
      get: () => normalized
    })
  }
}

function installBrowserStorage() {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
      dispatchEvent() {
        return true
      }
    }
  })
  return { localStorage, sessionStorage }
}

function record(id: string, submittedAt: string): WritingRecord {
  return {
    id,
    deviceId: 'test-device',
    taskType: 'task2',
    title: `Title ${id}`,
    prompt: `Prompt ${id}`,
    essay: `Essay ${id}`,
    submittedAt,
    durationSeconds: 1200,
    wordCount: 260,
    evaluation: {
      overallBand: '7',
      bandEstimate: '7',
      feedback: []
    }
  }
}

test('writing records remain isolated when switching between user accounts', () => {
  const { localStorage } = installBrowserStorage()
  const userA = '00000000-0000-4000-8000-00000000000a'
  const userB = '00000000-0000-4000-8000-00000000000b'

  saveWritingRecord(userA, record('a-1', '2026-06-18T10:00:00.000Z'))
  saveWritingRecord(userA, record('a-2', '2026-06-17T10:00:00.000Z'))
  saveWritingRecord(userA, record('a-3', '2026-06-16T10:00:00.000Z'))

  assert.equal(loadWritingRecords(userA).length, 3)
  assert.deepEqual(loadWritingRecords(userB), [])

  saveWritingRecord(userB, record('b-1', '2026-06-19T10:00:00.000Z'))
  assert.deepEqual(loadWritingRecords(userB).map((item) => item.id), ['b-1'])
  assert.deepEqual(loadWritingRecords(userA).map((item) => item.id), ['a-1', 'a-2', 'a-3'])

  localStorage.setItem(WritingRecordsStorageKey, JSON.stringify([record('legacy-a', '2026-06-15T10:00:00.000Z')]))
  assert.equal(loadWritingRecords(userB).some((item) => item.id === 'legacy-a'), false)
})

test('user cache keys include the authenticated identity', () => {
  const first = userWritingRecordsCacheKey(UserRouteCacheKeys.history, 'user-a')
  const second = userWritingRecordsCacheKey(UserRouteCacheKeys.history, 'user-b')
  const analytics = userWritingRecordsCacheKey(UserRouteCacheKeys.analytics, 'user-a')
  const firstList = userWritingRecordListCacheKey('user-a')
  const secondList = userWritingRecordListCacheKey('user-b')
  assert.notDeepEqual(first, second)
  assert.notDeepEqual(firstList, secondList)
  assert.deepEqual(first, ['user-writing-records', 'question_history', 'user-a'])
  assert.deepEqual(analytics, ['user-writing-records', 'question_analytics', 'user-a'])
  assert.deepEqual(firstList, ['writing-records-lightweight-list', 'user-a'])
})

test('logout cleanup removes only the active user ephemeral state', () => {
  const { localStorage, sessionStorage } = installBrowserStorage()
  const userA = 'user-a'
  const userB = 'user-b'
  const aDraft = userScopedStorageKey('ielts-writing-draft-task2', userA)
  const bDraft = userScopedStorageKey('ielts-writing-draft-task2', userB)
  const aHistory = userScopedStorageKey(WritingRecordsStorageKey, userA)
  const aPromptSelection = userScopedStorageKey('ielts-writing-prompt-selection-v1', userA)
  const aAnalytics = userScopedStorageKey('ielts-writing-analytics-cache', userA)
  const bAnalytics = userScopedStorageKey('ielts-writing-analytics-cache', userB)

  localStorage.setItem(aDraft, 'draft-a')
  localStorage.setItem(bDraft, 'draft-b')
  localStorage.setItem(aHistory, '[]')
  sessionStorage.setItem(aPromptSelection, '{}')
  sessionStorage.setItem(aAnalytics, '[]')
  sessionStorage.setItem(bAnalytics, '[]')

  clearUserEphemeralBrowserState(userA)

  assert.equal(localStorage.getItem(aDraft), null)
  assert.equal(sessionStorage.getItem(aPromptSelection), null)
  assert.equal(sessionStorage.getItem(aAnalytics), null)
  assert.equal(sessionStorage.getItem(bAnalytics), '[]')
  assert.equal(localStorage.getItem(bDraft), 'draft-b')
  assert.equal(localStorage.getItem(aHistory), '[]')
})

test('writing heatmap aggregates successful evaluation timestamps in Asia/Shanghai', () => {
  const activity = buildWritingActivity(
    [
      { created_at: '2026-06-18T15:59:59.000Z' },
      { created_at: '2026-06-18T16:00:00.000Z' },
      { created_at: '2026-06-18T18:30:00.000Z' }
    ],
    { today: new Date('2026-06-19T04:00:00.000Z'), days: 3 }
  )

  assert.deepEqual(activity, [
    { date: '2026-06-17', count: 0 },
    { date: '2026-06-18', count: 1 },
    { date: '2026-06-19', count: 2 }
  ])
})

test('user activity API and dashboard derive identity on the server and do not request recent records', async () => {
  const [routeSource, dashboardSource, activitySource, heatmapSource] = await Promise.all([
    readFile(new URL('../app/api/user/writing-activity/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/writing-activity.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/dashboard/WritingActivityHeatmap.tsx', import.meta.url), 'utf8')
  ])

  assert.match(routeSource, /getCurrentSupabaseUser\(\)/)
  assert.match(routeSource, /AllowedRanges/)
  assert.match(activitySource, /\.eq\('user_id', userId\)/)
  assert.doesNotMatch(dashboardSource, /最近批改记录|recentUsage|dashboard-usage-list/)
  assert.match(dashboardSource, /WritingActivityHeatmap userId=\{user\.id\}/)
  assert.match(heatmapSource, /\['writing-activity', userId, range\]/)
  assert.match(heatmapSource, /\{ days: 365, label: '一年' \}/)
  assert.match(heatmapSource, /\{ days: 183, label: '半年' \}/)
  assert.match(heatmapSource, /\{ days: 30, label: '一个月' \}/)
})

test('history page keeps one title source and uses a non-stretching card grid', async () => {
  const [historySource, css] = await Promise.all([
    readFile(new URL('../app/history/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.doesNotMatch(historySource, /className="history-header"/)
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(280px,\s*340px\)\)/)
  assert.match(css, /\.history-card\s*\{[\s\S]*?max-width:\s*340px;[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*312px;/)
})

test('account records use authenticated server storage with user-scoped RLS', async () => {
  const [recordsRoute, recordRoute, clientStore, migration] = await Promise.all([
    readFile(new URL('../app/api/user/writing-records/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/user/writing-records/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/writing-records.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260619232239_account_records_and_agreements.sql', import.meta.url), 'utf8')
  ])

  assert.match(recordsRoute, /getCurrentSupabaseUser\(\)/)
  assert.match(recordsRoute, /\.eq\('user_id', user\.id\)/)
  assert.match(recordsRoute, /\.eq\('request_id', prepared\.record\.requestId\)/)
  assert.match(recordsRoute, /id:\s*existing\.id/)
  assert.match(recordRoute, /\.eq\('user_id', user\.id\)/)
  assert.match(clientStore, /migrateLegacyWritingRecordsToServer/)
  assert.match(clientStore, /LegacyWritingRecordsMigrationKey/)
  assert.match(clientStore, /\/api\/user\/writing-records/)
  assert.match(migration, /writing_records_select_own/i)
  assert.match(migration, /writing_drafts_select_own/i)
  assert.match(migration, /user_agreements_select_own/i)
  assert.match(migration, /auth\.uid\(\)/i)
})
