'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import type {
  ErrorPattern,
  ErrorOccurrence
} from '@/lib/error-notebook-types'
import {
  ErrorCategoryLabels,
  ErrorCategoryGroups,
  ErrorCategoryGroupLabels,
  ErrorPatternStatusLabels
} from '@/lib/error-notebook-types'

type ErrorsData = {
  success: boolean
  patterns: ErrorPattern[]
  total: number
  page: number
  limit: number
  stats: { total: number; active: number; improving: number; mastered: number }
}

type BackfillStatus = {
  success: boolean
  totalRecords: number
  extractedRecords: number
  remainingRecords: number
  errorPatterns: number
  errorOccurrences: number
  isComplete: boolean
}

type BackfillResult = {
  success: boolean
  totalEligible: number
  processed: number
  remaining: number
  failed: number
  errors?: string[]
}

type OccurrencesData = {
  success: boolean
  occurrences: ErrorOccurrence[]
  total: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ErrorNotebookPage() {
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const [category, setCategory] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [sort, setSort] = useState<string>('recent')
  const [page, setPage] = useState(1)
  const [selectedPattern, setSelectedPattern] = useState<ErrorPattern | null>(null)
  const [reviewingPattern, setReviewingPattern] = useState<ErrorPattern | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillProgress, setBackfillProgress] = useState<BackfillResult | null>(null)

  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  params.set('sort', sort)
  params.set('page', String(page))
  params.set('limit', '20')

  const { data, error, isLoading, mutate } = useSWR<ErrorsData>(
    userId ? `/api/study-plan/errors?${params.toString()}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  )

  const { data: backfillStatus, mutate: mutateBackfill } = useSWR<BackfillStatus>(
    userId ? '/api/study-plan/errors/backfill/status' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  )

  const handleBackfill = useCallback(async () => {
    if (backfilling) return
    setBackfilling(true)
    try {
      const res = await fetch('/api/study-plan/errors/backfill', { method: 'POST' })
      const result = await res.json() as BackfillResult
      setBackfillProgress(result)
      
      if (result.processed > 0) {
        pushToast({
          kind: 'success',
          title: '分析完成',
          message: `已分析 ${result.processed} 篇作文${result.failed > 0 ? `，${result.failed} 篇失败` : ''}`
        })
        void mutate()
        void mutateBackfill()
      } else if (result.remaining === 0) {
        pushToast({ kind: 'info', title: '全部完成', message: '所有历史作文已分析完毕' })
      }
    } catch {
      pushToast({ kind: 'error', title: '分析失败', message: '请稍后重试' })
    } finally {
      setBackfilling(false)
    }
  }, [backfilling, pushToast, mutate, mutateBackfill])

  if (!userId || isLoading) return <PageSkeleton variant="chart" />

  if (error) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="analytics-main" style={{ paddingTop: 40 }}>
          <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
            <MaterialIcon name="error" size={48} />
            <h2 className="ui-title-headline" style={{ marginTop: 16 }}>加载失败</h2>
            <button className="ui-primary-button" type="button" style={{ marginTop: 16 }} onClick={() => void mutate()}>重新加载</button>
          </GlassPanel>
        </section>
      </main>
    )
  }

  const patterns = data?.patterns ?? []
  const stats = data?.stats ?? { total: 0, active: 0, improving: 0, mastered: 0 }
  const hasPatterns = patterns.length > 0
  const hasRecords = (backfillStatus?.totalRecords ?? 0) > 0
  const hasRemaining = (backfillStatus?.remainingRecords ?? 0) > 0
  const isBackfillComplete = backfillStatus?.isComplete ?? false

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="analytics-main" style={{ paddingTop: 40 }}>
        <header className="page-section-header">
          <div>
            <h1 className="ui-title-display">个人错误本</h1>
            <p className="ui-body-md" style={{ marginTop: 4 }}>
              自动汇总你在雅思写作中反复出现的错误，针对性复习。
            </p>
          </div>
          <Link href="/study-plan" className="ui-secondary-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MaterialIcon name="arrow_back" size={18} />
            返回学习规划
          </Link>
        </header>

        {hasRecords && hasRemaining && (
          <BackfillBanner
            totalRecords={backfillStatus?.totalRecords ?? 0}
            extractedRecords={backfillStatus?.extractedRecords ?? 0}
            remainingRecords={backfillStatus?.remainingRecords ?? 0}
            backfilling={backfilling}
            backfillProgress={backfillProgress}
            onStartBackfill={handleBackfill}
          />
        )}

        {hasPatterns && <ErrorStatsCards stats={stats} />}

        {hasPatterns && (
          <ErrorFilters
            category={category}
            status={status}
            sort={sort}
            onCategoryChange={(v) => { setCategory(v); setPage(1) }}
            onStatusChange={(v) => { setStatus(v); setPage(1) }}
            onSortChange={(v) => { setSort(v); setPage(1) }}
          />
        )}

        {!hasPatterns && !hasRecords && (
          <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
            <MaterialIcon name="check_circle" size={48} />
            <h2 className="ui-title-headline" style={{ marginTop: 16 }}>暂无写作记录</h2>
            <p className="ui-body-md" style={{ maxWidth: 400, margin: '8px auto' }}>
              完成更多作文批改后，错误会自动汇总到这里。
            </p>
            <Link className="ui-primary-button" href="/practice" style={{ marginTop: 16, display: 'inline-flex' }}>
              开始写作
            </Link>
          </GlassPanel>
        )}

        {!hasPatterns && hasRecords && !hasRemaining && isBackfillComplete && (
          <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
            <MaterialIcon name="check_circle" size={48} />
            <h2 className="ui-title-headline" style={{ marginTop: 16 }}>暂未发现重复错误</h2>
            <p className="ui-body-md" style={{ maxWidth: 400, margin: '8px auto' }}>
              已分析 {backfillStatus?.extractedRecords ?? 0} 篇作文，暂未发现可归纳的重复错误。完成更多写作后，错误本会持续更新。
            </p>
          </GlassPanel>
        )}

        {!hasPatterns && hasRecords && hasRemaining && !backfilling && (
          <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
            <MaterialIcon name="analytics" size={48} />
            <h2 className="ui-title-headline" style={{ marginTop: 16 }}>分析历史作文</h2>
            <p className="ui-body-md" style={{ maxWidth: 400, margin: '8px auto' }}>
              你已有 {backfillStatus?.totalRecords ?? 0} 篇历史写作记录，但尚未生成个人错误本。系统可以分析过去的批改结果，整理你反复出现的问题。
            </p>
            <button
              className="ui-primary-button"
              type="button"
              onClick={handleBackfill}
              disabled={backfilling}
              style={{ marginTop: 16 }}
            >
              {backfilling ? '正在分析…' : '分析历史作文'}
            </button>
          </GlassPanel>
        )}

        {hasPatterns && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {patterns.map((pattern) => (
              <ErrorPatternCard
                key={pattern.id}
                pattern={pattern}
                onView={() => setSelectedPattern(pattern)}
                onReview={() => setReviewingPattern(pattern)}
              />
            ))}
          </div>
        )}

        {data && data.total > data.limit && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              className="ui-secondary-button"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span className="ui-body-md" style={{ alignSelf: 'center' }}>
              第 {page} 页 / 共 {Math.ceil(data.total / data.limit)} 页
            </span>
            <button
              className="ui-secondary-button"
              type="button"
              disabled={page >= Math.ceil(data.total / data.limit)}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
        )}

        {selectedPattern && (
          <ErrorDetailDialog
            pattern={selectedPattern}
            onClose={() => setSelectedPattern(null)}
            onReview={() => {
              setSelectedPattern(null)
              setReviewingPattern(selectedPattern)
            }}
          />
        )}

        {reviewingPattern && (
          <ErrorReviewDialog
            pattern={reviewingPattern}
            onClose={() => setReviewingPattern(null)}
            onComplete={() => {
              setReviewingPattern(null)
              void mutate()
            }}
          />
        )}
      </section>
    </main>
  )
}

function BackfillBanner({ totalRecords, extractedRecords, remainingRecords, backfilling, backfillProgress, onStartBackfill }: {
  totalRecords: number
  extractedRecords: number
  remainingRecords: number
  backfilling: boolean
  backfillProgress: BackfillResult | null
  onStartBackfill: () => void
}) {
  const progress = totalRecords > 0 ? Math.round((extractedRecords / totalRecords) * 100) : 0
  const currentRemaining = backfillProgress ? backfillProgress.remaining : remainingRecords
  const justProcessed = backfillProgress?.processed ?? 0

  return (
    <GlassPanel style={{ padding: 20, background: 'linear-gradient(135deg, var(--surface-container-high), var(--surface-container))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <MaterialIcon name="analytics" size={24} />
        <div style={{ flex: 1 }}>
          <h2 className="ui-title-md">历史作文分析</h2>
          <p className="ui-body-md">
            {backfilling
              ? `正在分析… 已完成 ${extractedRecords + justProcessed} / ${totalRecords} 篇`
              : `已分析 ${extractedRecords} / ${totalRecords} 篇，还剩 ${currentRemaining} 篇`}
          </p>
        </div>
        {!backfilling && currentRemaining > 0 && (
          <button className="ui-primary-button" type="button" onClick={onStartBackfill}>
            继续分析
          </button>
        )}
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-container-low)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: 4,
            background: 'var(--primary)',
            transition: 'width 0.3s ease',
            width: `${progress}%`
          }}
        />
      </div>
      {backfillProgress && backfillProgress.failed > 0 && (
        <p className="ui-label" style={{ marginTop: 8, color: 'var(--warning)' }}>
          {backfillProgress.failed} 篇分析失败，可稍后重试
        </p>
      )}
    </GlassPanel>
  )
}

function ErrorStatsCards({ stats }: { stats: { total: number; active: number; improving: number; mastered: number } }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
      <GlassPanel className="ui-hover-glow" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MaterialIcon name="bug_report" size={18} className="text-primary" />
          <span className="ui-label">活跃错误</span>
        </div>
        <strong style={{ fontSize: 18 }}>{stats.active}</strong>
      </GlassPanel>
      <GlassPanel className="ui-hover-glow" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MaterialIcon name="trending_up" size={18} className="text-primary" />
          <span className="ui-label">改善中</span>
        </div>
        <strong style={{ fontSize: 18 }}>{stats.improving}</strong>
      </GlassPanel>
      <GlassPanel className="ui-hover-glow" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MaterialIcon name="check_circle" size={18} className="text-primary" />
          <span className="ui-label">已掌握</span>
        </div>
        <strong style={{ fontSize: 18 }}>{stats.mastered}</strong>
      </GlassPanel>
      <GlassPanel className="ui-hover-glow" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MaterialIcon name="summarize" size={18} className="text-primary" />
          <span className="ui-label">总错误类型</span>
        </div>
        <strong style={{ fontSize: 18 }}>{stats.total}</strong>
      </GlassPanel>
    </div>
  )
}

function ErrorFilters({ category, status, sort, onCategoryChange, onStatusChange, onSortChange }: {
  category: string
  status: string
  sort: string
  onCategoryChange: (v: string) => void
  onStatusChange: (v: string) => void
  onSortChange: (v: string) => void
}) {
  return (
    <GlassPanel style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ui-label">分类：</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--glass-border-1)' }}
          >
            <option value="">全部</option>
            {Object.entries(ErrorCategoryGroups).map(([groupKey, cats]) => (
              <optgroup key={groupKey} label={ErrorCategoryGroupLabels[groupKey] ?? groupKey}>
                {cats.map((cat) => (
                  <option key={cat} value={cat}>{ErrorCategoryLabels[cat]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ui-label">状态：</span>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--glass-border-1)' }}
          >
            <option value="">全部</option>
            {Object.entries(ErrorPatternStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ui-label">排序：</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--glass-border-1)' }}
          >
            <option value="recent">最近出现</option>
            <option value="count">出现次数</option>
            <option value="mastery">掌握程度</option>
          </select>
        </div>
      </div>
    </GlassPanel>
  )
}

function ErrorPatternCard({ pattern, onView, onReview }: {
  pattern: ErrorPattern
  onView: () => void
  onReview: () => void
}) {
  const categoryLabel = ErrorCategoryLabels[pattern.category] ?? pattern.category
  const statusLabel = ErrorPatternStatusLabels[pattern.status] ?? pattern.status
  const statusColor = pattern.status === 'mastered' ? 'var(--success)' : pattern.status === 'improving' ? 'var(--warning)' : 'var(--error)'

  return (
    <GlassPanel className="ui-hover-glow" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <strong>{pattern.title}</strong>
            <span className="task-badge" style={{ fontSize: 12 }}>{categoryLabel}</span>
            <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
          </div>
          {pattern.description && (
            <p className="ui-body-md" style={{ marginBottom: 8, fontSize: 15 }}>{pattern.description}</p>
          )}
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>出现 {pattern.occurrenceCount} 次</span>
            <span>最近：{new Date(pattern.lastSeenAt).toLocaleDateString('zh-CN')}</span>
            <span>掌握度：{Math.round(pattern.masteryLevel * 100)}%</span>
          </div>
          {pattern.exampleWrong && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-container-low)', fontSize: 15 }}>
              <div style={{ color: 'var(--error)', marginBottom: 4 }}>
                <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="close" size={14} /></span>
                {pattern.exampleWrong}
              </div>
              {pattern.exampleCorrect && (
                <div style={{ color: 'var(--success)' }}>
                  <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="check" size={14} /></span>
                  {pattern.exampleCorrect}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ui-secondary-button" type="button" onClick={onView} style={{ fontSize: 14, padding: '6px 12px' }}>
            详情
          </button>
          {pattern.status !== 'mastered' && (
            <button className="ui-primary-button" type="button" onClick={onReview} style={{ fontSize: 14, padding: '6px 12px' }}>
              复习
            </button>
          )}
        </div>
      </div>
    </GlassPanel>
  )
}

function ErrorDetailDialog({ pattern, onClose, onReview }: {
  pattern: ErrorPattern
  onClose: () => void
  onReview: () => void
}) {
  const { data } = useSWR<OccurrencesData>(
    `/api/study-plan/errors/${pattern.id}/occurrences?limit=5`,
    fetcher,
    { revalidateOnFocus: false }
  )

  const occurrences = data?.occurrences ?? []

  return (
    <CenteredDialog
      open
      title={pattern.title}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>关闭</button>
          {pattern.status !== 'mastered' && (
            <button className="ui-primary-button" type="button" onClick={onReview}>开始复习</button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span className="ui-label">分类</span>
          <p className="ui-body-md">{ErrorCategoryLabels[pattern.category] ?? pattern.category}</p>
        </div>
        <div>
          <span className="ui-label">描述</span>
          <p className="ui-body-md">{pattern.description || '暂无描述'}</p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <span className="ui-label">出现次数</span>
            <p className="ui-body-md">{pattern.occurrenceCount}</p>
          </div>
          <div>
            <span className="ui-label">掌握程度</span>
            <p className="ui-body-md">{Math.round(pattern.masteryLevel * 100)}%</p>
          </div>
          <div>
            <span className="ui-label">状态</span>
            <p className="ui-body-md">{ErrorPatternStatusLabels[pattern.status]}</p>
          </div>
        </div>

        {pattern.exampleWrong && (
          <div>
            <span className="ui-label">错误示例</span>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-container-low)', marginTop: 4 }}>
              <div style={{ color: 'var(--error)', marginBottom: pattern.exampleCorrect ? 6 : 0 }}>
                <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="close" size={14} /></span>
                {pattern.exampleWrong}
              </div>
              {pattern.exampleCorrect && (
                <div style={{ color: 'var(--success)' }}>
                  <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="check" size={14} /></span>
                  {pattern.exampleCorrect}
                </div>
              )}
            </div>
          </div>
        )}

        {occurrences.length > 0 && (
          <div>
            <span className="ui-label">最近出现</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {occurrences.map((occ) => (
                <div key={occ.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-container-low)', fontSize: 14 }}>
                  {occ.sentenceExcerpt && <p style={{ marginBottom: 4 }}>{occ.sentenceExcerpt}</p>}
                  {occ.correction && (
                    <p style={{ color: 'var(--success)' }}>
                      <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="check" size={12} /></span>
                      {occ.correction}
                    </p>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(occ.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CenteredDialog>
  )
}

function ErrorReviewDialog({ pattern, onClose, onComplete }: {
  pattern: ErrorPattern
  onClose: () => void
  onComplete: () => void
}) {
  const { pushToast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [userAnswer, setUserAnswer] = useState('')
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<'correct' | 'partial' | 'incorrect' | null>(null)

  const handleSubmit = async () => {
    if (!userAnswer.trim()) return

    let reviewResult: 'correct' | 'partial' | 'incorrect' = 'incorrect'
    if (pattern.exampleCorrect) {
      const similarity = computeSimilarity(userAnswer.trim().toLowerCase(), pattern.exampleCorrect.trim().toLowerCase())
      if (similarity > 0.8) reviewResult = 'correct'
      else if (similarity > 0.4) reviewResult = 'partial'
    }

    setResult(reviewResult)
    setShowResult(true)

    setSubmitting(true)
    try {
      const res = await fetch(`/api/study-plan/errors/${pattern.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewType: 'rewrite', result: reviewResult })
      })
      const data = await res.json() as { success?: boolean; masteryLevel?: number; status?: string }
      if (data.success) {
        pushToast({
          kind: reviewResult === 'correct' ? 'success' : 'info',
          title: reviewResult === 'correct' ? '回答正确！' : '继续加油',
          message: `掌握度：${Math.round((data.masteryLevel ?? 0) * 100)}%`
        })
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CenteredDialog
      open
      title={`复习：${pattern.title}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {!showResult ? (
            <>
              <button className="ui-secondary-button" type="button" onClick={onClose}>跳过</button>
              <button className="ui-primary-button" type="button" disabled={!userAnswer.trim() || submitting} onClick={handleSubmit}>
                {submitting ? '提交中…' : '提交答案'}
              </button>
            </>
          ) : (
            <button className="ui-primary-button" type="button" onClick={onComplete}>完成</button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pattern.exampleWrong && (
          <div>
            <span className="ui-label">请改正以下句子：</span>
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--surface-container-low)', marginTop: 6, fontSize: 15 }}>
              {pattern.exampleWrong}
            </div>
          </div>
        )}

        {!showResult ? (
          <div>
            <span className="ui-label">你的改正：</span>
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="输入你的改正版本…"
              rows={3}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--glass-border-1)', resize: 'vertical',
                fontFamily: 'inherit', fontSize: 14, marginTop: 6
              }}
            />
          </div>
        ) : (
          <div>
            {pattern.exampleCorrect && (
              <div>
                <span className="ui-label">参考答案：</span>
                <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--surface-container-low)', marginTop: 6, color: 'var(--success)' }}>
                  <span style={{ verticalAlign: 'middle', marginRight: 6 }}><MaterialIcon name="check" size={16} /></span>
                  {pattern.exampleCorrect}
                </div>
              </div>
            )}
            {result === 'correct' && (
              <p className="ui-body-md" style={{ color: 'var(--success)', marginTop: 8 }}>
                <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="celebration" size={16} /></span>
                回答正确！继续保持。
              </p>
            )}
            {result === 'partial' && (
              <p className="ui-body-md" style={{ color: 'var(--warning)', marginTop: 8 }}>
                <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="info" size={16} /></span>
                部分正确，注意参考答案的写法。
              </p>
            )}
            {result === 'incorrect' && (
              <p className="ui-body-md" style={{ color: 'var(--error)', marginTop: 8 }}>
                <span style={{ verticalAlign: 'middle', marginRight: 4 }}><MaterialIcon name="info" size={16} /></span>
                还需要改进，请仔细查看参考答案。
              </p>
            )}
          </div>
        )}
      </div>
    </CenteredDialog>
  )
}

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (longer.length === 0) return 1
  const editDistance = levenshtein(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[b.length][a.length]
}
