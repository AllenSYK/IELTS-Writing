'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import type { PastPaperListItem, PastPaperFrequencyLevel, ExamSession, ExamMode, QuestionCompleteness } from '@/lib/past-paper-types'
import {
  PastPaperFrequencyLabels,
  PastPaperSourceTypeLabels,
  Task1VisualTypeLabels,
  Task2QuestionTypeLabels,
  PastPaperTopicLabels,
  ExamSessionLabels,
  ExamModeLabels,
  CompletenessLabels
} from '@/lib/past-paper-types'

type Filters = {
  taskType: string
  frequencyLevel: string
  sourceType: string
  task1VisualType: string
  task2QuestionType: string
  topic: string
  year: string
  search: string
  examSession: string
  examMode: string
  completeness: string
  examDateFrom: string
  examDateTo: string
}

const defaultFilters: Filters = {
  taskType: 'all',
  frequencyLevel: 'all',
  sourceType: 'all',
  task1VisualType: 'all',
  task2QuestionType: 'all',
  topic: 'all',
  year: 'all',
  search: '',
  examSession: 'all',
  examMode: 'all',
  completeness: 'all',
  examDateFrom: '',
  examDateTo: ''
}

function countActiveFilters(filters: Filters): number {
  let count = 0
  for (const [key, val] of Object.entries(filters)) {
    if (key === 'search') { if (val) count++ }
    else if (val !== 'all' && val !== '') count++
  }
  return count
}

type PapersResponse = { success?: boolean; items?: PastPaperListItem[]; total?: number }

export default function PastPapersPage() {
  const { userId, status: sessionStatus } = useUserSession()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [searchInput, setSearchInput] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [availableYears, setAvailableYears] = useState<number[]>([])

  const pageSize = 12

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetch('/api/past-papers/years')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.years)) {
          setAvailableYears(data.years)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  const swrKey = userId ? `past-papers-${page}-${JSON.stringify(filters)}` : null
  const { data, error, isLoading, mutate } = useSWR(swrKey, async (): Promise<PapersResponse> => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (filters.taskType !== 'all') params.set('taskType', filters.taskType)
    if (filters.frequencyLevel !== 'all') params.set('frequencyLevel', filters.frequencyLevel)
    if (filters.sourceType !== 'all') params.set('sourceType', filters.sourceType)
    if (filters.task1VisualType !== 'all') params.set('task1VisualType', filters.task1VisualType)
    if (filters.task2QuestionType !== 'all') params.set('task2QuestionType', filters.task2QuestionType)
    if (filters.topic !== 'all') params.set('topic', filters.topic)
    if (filters.year !== 'all') params.set('year', filters.year)
    if (filters.search) params.set('search', filters.search)
    if (filters.examSession !== 'all') params.set('examSession', filters.examSession)
    if (filters.examMode !== 'all') params.set('examMode', filters.examMode)
    if (filters.completeness !== 'all') params.set('completeness', filters.completeness)
    if (filters.examDateFrom) params.set('examDateFrom', filters.examDateFrom)
    if (filters.examDateTo) params.set('examDateTo', filters.examDateTo)
    const res = await fetch(`/api/past-papers?${params}`)
    if (!res.ok) {
      throw new Error(`请求失败（${res.status}）`)
    }
    return res.json()
  }, { revalidateOnFocus: false, shouldRetryOnError: false })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const hasData = data !== undefined && !error
  const activeFilterCount = countActiveFilters(filters)

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function clearAllFilters() {
    setFilters(defaultFilters)
    setSearchInput('')
    setPage(1)
  }

  function handleSearch() {
    updateFilter('search', searchInput)
  }

  const totalPages = Math.ceil(total / pageSize)

  if (sessionStatus === 'loading') return <PageSkeleton />
  if (!userId) return <PageSkeleton />

  if (error) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="analytics-main" style={{ paddingTop: 40 }}>
          <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
            <MaterialIcon name="error" size={28} />
            <h2 className="ui-title-md" style={{ marginTop: 16 }}>真题加载失败</h2>
            <p className="ui-body-md">请稍后重试。</p>
            <button className="ui-primary-button" type="button" style={{ marginTop: 16 }} onClick={() => void mutate()}>
              重新加载
            </button>
          </GlassPanel>
        </section>
      </main>
    )
  }

  const yearOptions = availableYears.length > 0
    ? availableYears.map((y) => ({ value: String(y), label: String(y) }))
    : Array.from({ length: 12 }, (_, i) => 2025 - i).map((y) => ({ value: String(y), label: String(y) }))

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="analytics-main" style={{ paddingTop: 40 }}>
        <header className="page-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/practice" className="ui-secondary-button" style={{ padding: '6px 10px' }}>
              <MaterialIcon name="arrow_back" size={18} />
            </Link>
            <h1 className="ui-title-display">雅思真题</h1>
          </div>
        </header>

        <GlassPanel style={{ padding: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <FilterSelect label="任务类型" value={filters.taskType} onChange={(v) => updateFilter('taskType', v)}
              options={[{ value: 'all', label: '全部' }, { value: 'task1', label: 'Task 1' }, { value: 'task2', label: 'Task 2' }, { value: 'full_test', label: '完整套题' }]} />

            <FilterSelect label="频率" value={filters.frequencyLevel} onChange={(v) => updateFilter('frequencyLevel', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(PastPaperFrequencyLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="来源" value={filters.sourceType} onChange={(v) => updateFilter('sourceType', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(PastPaperSourceTypeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="场次" value={filters.examSession} onChange={(v) => updateFilter('examSession', v)}
              options={[{ value: 'all', label: '全部场次' }, ...Object.entries(ExamSessionLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="考试形式" value={filters.examMode} onChange={(v) => updateFilter('examMode', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(ExamModeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="完整度" value={filters.completeness} onChange={(v) => updateFilter('completeness', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(CompletenessLabels).map(([k, v]) => ({ value: k, label: v }))]} />
          </div>

          <button
            className="ui-secondary-button"
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ marginBottom: 12, fontSize: 13 }}
          >
            {showAdvanced ? '收起高级筛选' : '展开高级筛选'}
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <FilterSelect label="Task 1 类型" value={filters.task1VisualType} onChange={(v) => updateFilter('task1VisualType', v)}
                options={[{ value: 'all', label: '全部' }, ...Object.entries(Task1VisualTypeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

              <FilterSelect label="Task 2 题型" value={filters.task2QuestionType} onChange={(v) => updateFilter('task2QuestionType', v)}
                options={[{ value: 'all', label: '全部' }, ...Object.entries(Task2QuestionTypeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

              <FilterSelect label="主题" value={filters.topic} onChange={(v) => updateFilter('topic', v)}
                options={[{ value: 'all', label: '全部' }, ...Object.entries(PastPaperTopicLabels).map(([k, v]) => ({ value: k, label: v }))]} />

              <FilterSelect label="年份" value={filters.year} onChange={(v) => updateFilter('year', v)}
                options={[{ value: 'all', label: '全部年份' }, ...yearOptions]} />

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>考试日期从</span>
                <input
                  type="date"
                  value={filters.examDateFrom}
                  onChange={(e) => updateFilter('examDateFrom', e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--outline-variant)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>到</span>
                <input
                  type="date"
                  value={filters.examDateTo}
                  onChange={(e) => updateFilter('examDateTo', e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--outline-variant)' }}
                />
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="history-search"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)' }}
              placeholder="搜索题目、关键词、来源"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="ui-secondary-button" type="button" onClick={handleSearch}>搜索</button>
            {activeFilterCount > 0 && (
              <button className="ui-secondary-button" type="button" onClick={clearAllFilters}>
                清除筛选{activeFilterCount > 0 ? `（${activeFilterCount}）` : ''}
              </button>
            )}
          </div>
        </GlassPanel>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-card" style={{ height: 160, borderRadius: 12 }} />)}
          </div>
        ) : items.length === 0 ? (
          <GlassPanel level={2} className="empty-state">
            <MaterialIcon name="inbox" size={28} />
            <h2 className="ui-title-md">{hasData && activeFilterCount > 0 ? '没有符合当前筛选条件的真题' : '暂无已发布真题'}</h2>
            <p className="ui-body-md">{hasData && activeFilterCount > 0 ? '请调整筛选条件或搜索词。' : '暂时还没有已发布的真题。'}</p>
            {activeFilterCount > 0 && (
              <button className="ui-secondary-button" type="button" style={{ marginTop: 12 }} onClick={clearAllFilters}>
                清除全部筛选
              </button>
            )}
          </GlassPanel>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {items.map((item) => (
              <PaperCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="ui-secondary-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <span className="ui-label" style={{ alignSelf: 'center' }}>{page} / {totalPages}</span>
            <button className="ui-secondary-button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        )}
      </section>
    </main>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{label}</span>
      <select
        className="filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13 }}
      >
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  )
}

function formatExamDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`
  }
  return dateStr
}

function PaperCard({ item }: { item: PastPaperListItem }) {
  const freqLabel = PastPaperFrequencyLabels[item.frequencyLevel as PastPaperFrequencyLevel] ?? item.frequencyLevel
  const taskLabel = item.taskType === 'task1_academic' || item.taskType === 'task1_general' ? 'Task 1' : item.taskType === 'task2' ? 'Task 2' : '完整套题'
  const completenessLabel = item.completeness ? CompletenessLabels[item.completeness as QuestionCompleteness] : null

  const isIncomplete = item.completeness === 'partial' || item.completeness === 'summary_only' || item.completeness === 'missing'
  const canPractice = !isIncomplete || item.taskType === 'task2'

  return (
    <GlassPanel className="ui-hover-glow" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="task-badge">{taskLabel}</span>
          <span className="task-badge is-custom">{freqLabel}</span>
          {item.sourceType && <span className="ui-label">{PastPaperSourceTypeLabels[item.sourceType as keyof typeof PastPaperSourceTypeLabels] ?? item.sourceType}</span>}
        </div>
        {completenessLabel && (
          <span className="task-badge" style={{ fontSize: 11, background: isIncomplete ? 'var(--error-container)' : undefined, color: isIncomplete ? 'var(--on-error-container)' : undefined }}>
            {completenessLabel}
          </span>
        )}
      </div>

      {item.examDate && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="ui-label">
            <MaterialIcon name="event" size={14} />
            {formatExamDate(item.examDate)}
          </span>
          {item.examSession && item.examSession !== 'unknown' && (
            <span className="ui-label">{ExamSessionLabels[item.examSession as ExamSession]}</span>
          )}
          {item.examMode && item.examMode !== 'unknown' && (
            <span className="ui-label">{ExamModeLabels[item.examMode as ExamMode]}</span>
          )}
          {item.examRegion && (
            <span className="ui-label">{item.examRegion}</span>
          )}
        </div>
      )}

      <h3 className="ui-title-md" style={{ marginBottom: 6, lineHeight: 1.4 }}>{item.title || '未命名题目'}</h3>
      <p className="ui-body-md" style={{ marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {item.summary || '暂无摘要'}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.primaryTopic && (
            <span className="ui-label">{PastPaperTopicLabels[item.primaryTopic] ?? item.primaryTopic}</span>
          )}
          {!item.primaryTopic && item.topics?.slice(0, 2).map((t) => (
            <span key={t} className="ui-label">{PastPaperTopicLabels[t] ?? t}</span>
          ))}
          {item.sourceYear && <span className="ui-label">{item.sourceYear}</span>}
        </div>
        {canPractice ? (
          <Link className="ui-primary-button" href={`/write/${item.taskType === 'task2' ? 'task2' : 'task1'}?pastPaper=${item.id}`} style={{ fontSize: 13, padding: '6px 14px' }}>
            开始练习
          </Link>
        ) : (
          <span className="ui-label" style={{ color: 'var(--on-surface-variant)' }}>题目不完整</span>
        )}
      </div>
    </GlassPanel>
  )
}
