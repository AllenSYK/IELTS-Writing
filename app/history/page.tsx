'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ConfirmDialog, EmptyState, useDebouncedValue, useToast } from '@/components/interaction-system'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import {
  TaskTypeLabels,
  deleteWritingRecord,
  formatBand,
  formatDate,
  formatDuration,
  restoreWritingRecord,
  scoreValue,
  type WritingRecord,
  type WritingTaskType
} from '@/lib/writing-records'
import { UserRouteCacheKeys, useUserWritingRecords } from '@/lib/user-route-cache'
import { userScopedStorageKey } from '@/lib/user-storage'

type TaskFilter = 'all' | WritingTaskType
type RangeFilter = '7' | '30' | 'year' | 'all'
type SortFilter = 'newest' | 'oldest' | 'score-high' | 'score-low'
type ScoreFilter = 'all' | 'below6' | '6to7' | 'above7'

const HistoryFilterStorageKey = 'ielts-writing-history-filters-v1'

function inDateRange(record: WritingRecord, range: RangeFilter) {
  if (range === 'all') return true
  const submitted = new Date(record.submittedAt).getTime()
  const now = Date.now()
  if (range === 'year') {
    return new Date(record.submittedAt).getFullYear() === new Date().getFullYear()
  }
  const days = Number(range)
  return now - submitted <= days * 24 * 60 * 60 * 1000
}

function matchesScore(record: WritingRecord, scoreFilter: ScoreFilter) {
  if (scoreFilter === 'all') return true
  const score = scoreValue(record.evaluation.bandEstimate)
  if (score === null) return false
  if (scoreFilter === 'below6') return score < 6
  if (scoreFilter === '6to7') return score >= 6 && score < 7
  return score >= 7
}

function criterionBrief(record: WritingRecord) {
  const evaluation = record.evaluation
  const taskScore = record.taskType === 'task1'
    ? evaluation.taskAchievement?.score || evaluation.criteria?.taskAchievement?.score
    : record.taskType === 'task2'
      ? evaluation.taskResponse?.score || evaluation.criteria?.taskResponse?.score
      : evaluation.taskAchievement?.score || evaluation.taskResponse?.score
  return [
    { label: record.taskType === 'task1' ? 'TA' : 'TR', value: formatBand(taskScore) },
    { label: 'CC', value: formatBand(evaluation.coherenceCohesion?.score || evaluation.criteria?.coherenceCohesion?.score) },
    { label: 'LR', value: formatBand(evaluation.lexicalResource?.score || evaluation.criteria?.lexicalResource?.score) },
    { label: 'GRA', value: formatBand(evaluation.grammaticalRangeAccuracy?.score || evaluation.criteria?.grammaticalRangeAccuracy?.score) }
  ]
}

function HistoryCard({ record, removing, onDelete }: { record: WritingRecord; removing: boolean; onDelete: (record: WritingRecord) => void }) {
  const criteria = criterionBrief(record)

  return (
    <article className={`history-card ui-hover-glow ${removing ? 'is-removing' : ''}`}>
      <div className="history-card-main">
        <div className="history-card-meta">
          <span className="task-badge">{TaskTypeLabels[record.taskType]}</span>
          <span className="ui-label history-date">
            <MaterialIcon name="calendar_today" size={16} />
            {formatDate(record.submittedAt)}
          </span>
        </div>
        <h2 className="ui-title-md">{record.title}</h2>
        <div className="history-card-stats">
          <span className="ui-body-md">
            <MaterialIcon name="notes" size={20} />
            {record.wordCount} 词
          </span>
          <span className="ui-body-md">
            <MaterialIcon name="timer" size={20} />
            {formatDuration(record.durationSeconds)}
          </span>
        </div>
      </div>

      <div className="history-score">
        <strong>{formatBand(record.evaluation.overallBand || record.evaluation.bandEstimate)}</strong>
        <div className="history-criteria" aria-label="四项分数">
          {criteria.map((item) => (
            <span key={item.label}>{item.label} {item.value}</span>
          ))}
        </div>
        <div className="history-buttons">
          <Link className="ui-primary-button" href={`/result?id=${record.id}`}>
            查看详情
          </Link>
          <button className="danger-link history-delete" type="button" aria-label="删除记录" onClick={() => onDelete(record)}>
            <MaterialIcon name="delete" size={18} />
          </button>
        </div>
      </div>
    </article>
  )
}

export default function HistoryPage() {
  const { pushToast } = useToast()
  const { userId } = useUserSession()
  const { records, isLoading } = useUserWritingRecords(UserRouteCacheKeys.history, userId)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all')
  const [sortFilter, setSortFilter] = useState<SortFilter>('newest')
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all')
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<WritingRecord | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const debouncedQuery = useDebouncedValue(query, 220)

  useEffect(() => {
    if (!userId) return
    window.queueMicrotask(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(userScopedStorageKey(HistoryFilterStorageKey, userId)) || '{}') as Partial<{
          taskFilter: TaskFilter
          rangeFilter: RangeFilter
          sortFilter: SortFilter
          scoreFilter: ScoreFilter
          query: string
        }>
        if (stored.taskFilter) setTaskFilter(stored.taskFilter)
        if (stored.rangeFilter) setRangeFilter(stored.rangeFilter)
        if (stored.sortFilter) setSortFilter(stored.sortFilter)
        if (stored.scoreFilter) setScoreFilter(stored.scoreFilter)
        setQuery(new URLSearchParams(window.location.search).get('q') || stored.query || '')
      } catch {
        setQuery(new URLSearchParams(window.location.search).get('q') || '')
      }
      setPreferencesLoaded(true)
    })
  }, [userId])

  useEffect(() => {
    if (!preferencesLoaded || !userId) return
    window.localStorage.setItem(userScopedStorageKey(HistoryFilterStorageKey, userId), JSON.stringify({ taskFilter, rangeFilter, sortFilter, scoreFilter, query }))
  }, [preferencesLoaded, query, rangeFilter, scoreFilter, sortFilter, taskFilter, userId])

  const visibleRecords = useMemo(
    () => {
      const normalized = debouncedQuery.trim().toLowerCase()
      const filtered = records.filter((record) => {
        const taskMatches = taskFilter === 'all' || record.taskType === taskFilter
        const textMatches =
          !normalized ||
          `${record.title} ${record.prompt} ${record.essay} ${TaskTypeLabels[record.taskType]} ${record.evaluation.summary || ''} ${(record.evaluation.weaknesses || []).join(' ')}`.toLowerCase().includes(normalized)
        return taskMatches && inDateRange(record, rangeFilter) && matchesScore(record, scoreFilter) && textMatches
      })
      return filtered.sort((a, b) => {
        if (sortFilter === 'oldest') return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
        if (sortFilter === 'score-high') return (scoreValue(b.evaluation.bandEstimate) ?? 0) - (scoreValue(a.evaluation.bandEstimate) ?? 0)
        if (sortFilter === 'score-low') return (scoreValue(a.evaluation.bandEstimate) ?? 0) - (scoreValue(b.evaluation.bandEstimate) ?? 0)
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      })
    },
    [debouncedQuery, rangeFilter, records, scoreFilter, sortFilter, taskFilter]
  )

  const filterOptions: Array<{ id: TaskFilter; label: string }> = [
    { id: 'all', label: 'IELTS Academic' },
    { id: 'task1', label: 'IELTS Task 1' },
    { id: 'task2', label: 'IELTS Task 2' },
    { id: 'mock', label: '完整测试' }
  ]

  const scoreOptions: Array<{ id: ScoreFilter; label: string }> = [
    { id: 'all', label: '全部分数' },
    { id: 'below6', label: '< 6.0' },
    { id: '6to7', label: '6.0–6.9' },
    { id: 'above7', label: '7.0+' }
  ]

  function confirmDelete() {
    if (!pendingDelete || !userId) return
    setRemovingId(pendingDelete.id)
    window.setTimeout(() => {
      const deleted = deleteWritingRecord(userId, pendingDelete.id)
      setRemovingId(null)
      setPendingDelete(null)
      if (deleted) {
        pushToast({
          kind: 'warning',
          title: '记录已删除',
          message: '短时间内可以撤销。',
          actionLabel: 'Undo',
          onAction: () => {
            restoreWritingRecord(userId, deleted)
            pushToast({ kind: 'success', title: '已恢复记录' })
          },
          durationMs: 8000
        })
      }
    }, 220)
  }

  if (!preferencesLoaded || isLoading) return <PageSkeleton />

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="history-main">
        <div className="history-toolbar">
          <label className="history-search">
            <MaterialIcon name="search" size={18} />
            <input
              data-search-input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索题目、正文或批改记录"
              aria-label="搜索历史记录"
            />
          </label>
          <select className="filter-select" value={sortFilter} onChange={(event) => setSortFilter(event.target.value as SortFilter)} aria-label="排序方式">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score-high">分数从高到低</option>
            <option value="score-low">分数从低到高</option>
          </select>
          <span className="ui-label">{visibleRecords.length} / {records.length}</span>
        </div>

        <aside>
          <GlassPanel className="history-filters">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
              <MaterialIcon name="tune" />
              <h2 className="ui-title-md">筛选条件</h2>
            </div>

            <div className="filter-group">
              <h3 className="ui-label">考试类型</h3>
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  className={`filter-option ${taskFilter === option.id ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setTaskFilter(option.id)}
                >
                  <span className="filter-box">
                    {taskFilter === option.id ? <MaterialIcon name="check" size={14} /> : null}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <div className="filter-group">
              <h3 className="ui-label">时间范围</h3>
              <select className="filter-select" value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value as RangeFilter)}>
                <option value="7">最近 7 天</option>
                <option value="30">最近 30 天</option>
                <option value="year">今年</option>
                <option value="all">全部时间</option>
              </select>
            </div>

            <div className="filter-group">
              <h3 className="ui-label">分数范围</h3>
              <div className="score-range-row">
                {scoreOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`filter-chip ${scoreFilter === option.id ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setScoreFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </GlassPanel>
        </aside>

        <div className="history-list">
          {visibleRecords.length > 0 ? (
            visibleRecords.map((record) => (
              <HistoryCard key={record.id} record={record} removing={removingId === record.id} onDelete={setPendingDelete} />
            ))
          ) : (
            <EmptyState title="暂无匹配记录" message="请调整搜索或筛选条件，或完成一次批改后再查看。" href="/practice" action="开始练习" />
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这条练习记录？"
        message="删除后会先从列表移除，短时间内可以通过 Undo 恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </main>
  )
}
