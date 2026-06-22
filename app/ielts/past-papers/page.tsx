'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import type { PastPaperListItem, PastPaperFrequencyLevel } from '@/lib/past-paper-types'
import {
  PastPaperFrequencyLabels,
  PastPaperSourceTypeLabels,
  Task1VisualTypeLabels,
  Task2QuestionTypeLabels,
  PastPaperTopicLabels
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
}

const defaultFilters: Filters = {
  taskType: 'all',
  frequencyLevel: 'all',
  sourceType: 'all',
  task1VisualType: 'all',
  task2QuestionType: 'all',
  topic: 'all',
  year: 'all',
  search: ''
}

type PapersResponse = { success?: boolean; items?: PastPaperListItem[]; total?: number }

export default function PastPapersPage() {
  const { userId } = useUserSession()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [searchInput, setSearchInput] = useState('')

  const pageSize = 12

  const swrKey = userId ? `past-papers-${page}-${JSON.stringify(filters)}` : null
  const { data, isLoading } = useSWR(swrKey, async (): Promise<PapersResponse> => {
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
    const res = await fetch(`/api/past-papers?${params}`)
    return res.json()
  }, { revalidateOnFocus: false })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function handleSearch() {
    updateFilter('search', searchInput)
  }

  const totalPages = Math.ceil(total / pageSize)

  if (!userId) return <PageSkeleton />

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <FilterSelect label="任务类型" value={filters.taskType} onChange={(v) => updateFilter('taskType', v)}
              options={[{ value: 'all', label: '全部' }, { value: 'task1', label: 'Task 1' }, { value: 'task2', label: 'Task 2' }, { value: 'full_test', label: '完整套题' }]} />

            <FilterSelect label="频率" value={filters.frequencyLevel} onChange={(v) => updateFilter('frequencyLevel', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(PastPaperFrequencyLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="来源" value={filters.sourceType} onChange={(v) => updateFilter('sourceType', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(PastPaperSourceTypeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="Task 1 类型" value={filters.task1VisualType} onChange={(v) => updateFilter('task1VisualType', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(Task1VisualTypeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="Task 2 题型" value={filters.task2QuestionType} onChange={(v) => updateFilter('task2QuestionType', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(Task2QuestionTypeLabels).map(([k, v]) => ({ value: k, label: v }))]} />

            <FilterSelect label="主题" value={filters.topic} onChange={(v) => updateFilter('topic', v)}
              options={[{ value: 'all', label: '全部' }, ...Object.entries(PastPaperTopicLabels).map(([k, v]) => ({ value: k, label: v }))]} />
          </div>

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
          </div>
        </GlassPanel>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-card" style={{ height: 160, borderRadius: 12 }} />)}
          </div>
        ) : items.length === 0 ? (
          <GlassPanel level={2} className="empty-state">
            <MaterialIcon name="inbox" size={28} />
            <h2 className="ui-title-md">暂无匹配真题</h2>
            <p className="ui-body-md">请调整筛选条件或搜索词。</p>
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
    <select
      className="filter-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13 }}
    >
      {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  )
}

function PaperCard({ item }: { item: PastPaperListItem }) {
  const freqLabel = PastPaperFrequencyLabels[item.frequencyLevel as PastPaperFrequencyLevel] ?? item.frequencyLevel
  const taskLabel = item.taskType === 'task1_academic' || item.taskType === 'task1_general' ? 'Task 1' : item.taskType === 'task2' ? 'Task 2' : '完整套题'

  return (
    <GlassPanel className="ui-hover-glow" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="task-badge">{taskLabel}</span>
          <span className="task-badge is-custom">{freqLabel}</span>
          {item.sourceType && <span className="ui-label">{PastPaperSourceTypeLabels[item.sourceType] ?? item.sourceType}</span>}
        </div>
        {item.difficulty && <span className="ui-label">{item.difficulty}</span>}
      </div>

      <h3 className="ui-title-md" style={{ marginBottom: 6, lineHeight: 1.4 }}>{item.title || '未命名题目'}</h3>
      <p className="ui-body-md" style={{ marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {item.summary || '暂无摘要'}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.topics?.slice(0, 2).map((t) => (
            <span key={t} className="ui-label">{PastPaperTopicLabels[t] ?? t}</span>
          ))}
          {item.sourceYear && <span className="ui-label">{item.sourceYear}</span>}
        </div>
        <Link className="ui-primary-button" href={`/write/${item.taskType === 'task2' ? 'task2' : 'task1'}?pastPaper=${item.id}`} style={{ fontSize: 13, padding: '6px 14px' }}>
          开始练习
        </Link>
      </div>
    </GlassPanel>
  )
}
