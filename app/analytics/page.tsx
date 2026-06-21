'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ErrorDistributionBars } from '@/components/analytics/ErrorDistributionBars'
import { GoalStatusPanel } from '@/components/analytics/GoalStatusPanel'
import { IeltsRadarChart } from '@/components/analytics/IeltsRadarChart'
import { PracticePlan } from '@/components/analytics/PracticePlan'
import { ChartSkeleton } from '@/components/loading/ChartSkeleton'
import { QuestionSkeleton } from '@/components/loading/QuestionSkeleton'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import {
  buildErrorDistribution,
  buildPracticeRecommendations,
  buildRadarMetrics
} from '@/lib/learning-analytics'
import { averageTaskBand } from '@/lib/ielts-scoring'
import {
  averageScore,
  scoreValue,
  type EssayAnnotation,
  type EssayEvaluation,
  type WritingRecord
} from '@/lib/writing-records'
import { useUserProfile } from '@/stores/user-profile-store'
import { userScopedStorageKey } from '@/lib/user-storage'

type AnalyticsRange = '7' | '30' | 'all'

const ANALYTICS_INVALIDATED_EVENT = 'ielts-writing-analytics-invalidated'
const ANALYTICS_CACHE_KEY = 'ielts-writing-analytics-cache'

type AnalyticsApiRecord = {
  id: string
  taskType: string
  submittedAt: string
  processingStatus: string
  overallBand: number | null
  taskAchievement: { score: string; feedback: string } | null
  taskResponse: { score: string; feedback: string } | null
  coherenceCohesion: { score: string; feedback: string } | null
  lexicalResource: { score: string; feedback: string } | null
  grammaticalRangeAccuracy: { score: string; feedback: string } | null
  annotations: EssayAnnotation[]
}

function toCriterionScore(raw: { score: string; feedback: string } | null): EssayEvaluation['taskAchievement'] {
  if (!raw) return undefined
  return { score: raw.score, feedback: raw.feedback }
}

function adaptRecord(r: AnalyticsApiRecord): WritingRecord {
  const band = r.overallBand !== null ? String(r.overallBand) : ''
  const evaluation: EssayEvaluation = {
    overallBand: band,
    bandEstimate: band,
    taskAchievement: toCriterionScore(r.taskAchievement),
    taskResponse: toCriterionScore(r.taskResponse),
    coherenceCohesion: toCriterionScore(r.coherenceCohesion),
    lexicalResource: toCriterionScore(r.lexicalResource),
    grammaticalRangeAccuracy: toCriterionScore(r.grammaticalRangeAccuracy),
    criteria: {
      ...(r.taskAchievement ? { taskAchievement: toCriterionScore(r.taskAchievement)! } : {}),
      ...(r.taskResponse ? { taskResponse: toCriterionScore(r.taskResponse)! } : {}),
      ...(r.coherenceCohesion ? { coherenceCohesion: toCriterionScore(r.coherenceCohesion)! } : {}),
      ...(r.lexicalResource ? { lexicalResource: toCriterionScore(r.lexicalResource)! } : {}),
      ...(r.grammaticalRangeAccuracy ? { grammaticalRangeAccuracy: toCriterionScore(r.grammaticalRangeAccuracy)! } : {})
    },
    annotations: r.annotations,
    sentenceAnnotations: [],
    sentenceErrors: [],
    feedback: [],
    summary: '',
    overallFeedback: '',
    strengths: [],
    weaknesses: [],
    suggestions: [],
    correctedEssay: '',
    improvedEssay: '',
    revisedEssay: '',
    modelEssay: '',
    annotationWarnings: [],
    nextSteps: []
  }
  return {
    id: r.id,
    deviceId: 'analytics',
    taskType: r.taskType as WritingRecord['taskType'],
    title: '',
    prompt: '',
    essay: '',
    submittedAt: r.submittedAt,
    durationSeconds: 0,
    wordCount: 0,
    evaluation
  }
}

function readCachedRecords(): WritingRecord[] {
  try {
    const raw = sessionStorage.getItem(ANALYTICS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as WritingRecord[]
  } catch {
    return []
  }
}

function writeCachedRecords(records: WritingRecord[]) {
  try {
    sessionStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify(records))
  } catch {
    // ignore quota errors
  }
}

async function fetchAnalyticsRecords(): Promise<WritingRecord[]> {
  const response = await fetch('/api/user/writing-records/analytics', { cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { success?: boolean; records?: AnalyticsApiRecord[]; message?: string }
  if (!response.ok || !data.success) throw new Error(data.message || '学习分析数据加载失败')
  return (data.records ?? []).map(adaptRecord)
}

function buildTrend(records: WritingRecord[]) {
  const scores = records
    .slice()
    .reverse()
    .map((record) => scoreValue(record.evaluation.bandEstimate))
    .filter((score): score is number => score !== null)
    .slice(-7)

  if (scores.length < 2) return { line: '', fill: '', points: [] as Array<{ x: number; y: number; score: number }> }

  const points = scores.map((score, index) => {
    const x = (index / (scores.length - 1)) * 100
    const normalized = Math.min(1, Math.max(0, score / 9))
    const y = 48 - normalized * 42
    return { x, y, score }
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const fill = `${line} L100,50 L0,50 Z`
  return { line, fill, points }
}

function AnalyticsSkeleton() {
  return (
    <main className="ui-page" data-main-content tabIndex={-1} aria-busy="true">
      <section className="analytics-main" style={{ paddingTop: 120 }}>
        <QuestionSkeleton />
        <ChartSkeleton />
        <div className="skeleton-grid cards">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton-card" />
          ))}
        </div>
        <span className="sr-only" role="status" aria-live="polite">正在加载学习分析</span>
      </section>
    </main>
  )
}

export default function AnalyticsPage() {
  const { userId } = useUserSession()
  const { profile } = useUserProfile()

  const cachedRecords = useMemo(() => readCachedRecords(), [])
  const [records, setRecords] = useState<WritingRecord[]>(cachedRecords)
  const [initialLoading, setInitialLoading] = useState(cachedRecords.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [range, setRange] = useState<AnalyticsRange>('30')
  const [now, setNow] = useState(0)
  const isFetchingRef = useRef(false)
  const isMountedRef = useRef(true)
  const hasRequestedRef = useRef(false)

  const loadAnalytics = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    if (records.length > 0) {
      setRefreshing(true)
    } else {
      setInitialLoading(true)
    }
    try {
      const result = await fetchAnalyticsRecords()
      if (isMountedRef.current) {
        setRecords(result)
        setFetchError(null)
        writeCachedRecords(result)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setFetchError(err instanceof Error ? err.message : '加载失败，请稍后重试。')
      }
    } finally {
      isFetchingRef.current = false
      if (isMountedRef.current) {
        setInitialLoading(false)
        setRefreshing(false)
      }
    }
  }, [records.length])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!userId) return
    if (hasRequestedRef.current) return
    hasRequestedRef.current = true
    void loadAnalytics()
  }, [userId, loadAnalytics])

  useEffect(() => {
    const handleInvalidated = () => {
      if (isMountedRef.current) void loadAnalytics()
    }
    window.addEventListener(ANALYTICS_INVALIDATED_EVENT, handleInvalidated)
    return () => window.removeEventListener(ANALYTICS_INVALIDATED_EVENT, handleInvalidated)
  }, [loadAnalytics])

  useEffect(() => {
    if (!userId) return
    window.queueMicrotask(() => {
      setRange((window.localStorage.getItem(userScopedStorageKey('ielts-writing-analytics-range', userId)) as AnalyticsRange | null) || '30')
      setNow(Date.now())
      setPreferencesLoaded(true)
    })
  }, [userId])

  useEffect(() => {
    if (preferencesLoaded && userId) window.localStorage.setItem(userScopedStorageKey('ielts-writing-analytics-range', userId), range)
  }, [preferencesLoaded, range, userId])

  const scopedRecords = useMemo(() => {
    if (range === 'all') return records
    const days = Number(range)
    const cutoff = now - days * 24 * 60 * 60 * 1000
    return records.filter((record) => new Date(record.submittedAt).getTime() >= cutoff)
  }, [now, range, records])

  const average = useMemo(() => averageScore(scopedRecords), [scopedRecords])
  const task1Average = useMemo(() => averageTaskBand(scopedRecords, 'task1'), [scopedRecords])
  const task2Average = useMemo(() => averageTaskBand(scopedRecords, 'task2'), [scopedRecords])
  const trend = useMemo(() => buildTrend(scopedRecords), [scopedRecords])
  const radarMetrics = useMemo(() => buildRadarMetrics(scopedRecords, profile), [profile, scopedRecords])
  const weakest = useMemo(
    () => radarMetrics.filter((metric) => metric.current !== null).sort((a, b) => (a.current ?? 9) - (b.current ?? 9))[0] ?? null,
    [radarMetrics]
  )
  const errorDistribution = useMemo(() => buildErrorDistribution(scopedRecords), [scopedRecords])
  const recommendations = useMemo(() => buildPracticeRecommendations(scopedRecords), [scopedRecords])

  if (!preferencesLoaded || (initialLoading && records.length === 0)) return <AnalyticsSkeleton />

  const rangeOptions: Array<{ id: AnalyticsRange; label: string }> = [
    { id: '7', label: '近7天' },
    { id: '30', label: '近30天' },
    { id: 'all', label: '全部' }
  ]

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="analytics-main">
        {refreshing ? (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 9999, background: 'rgba(0,88,188,0.15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '40%', background: '#0058bc', borderRadius: 1, animation: 'analytics-loading-slide 1.2s ease-in-out infinite' }} />
          </div>
        ) : null}

        {fetchError && records.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(186,26,26,0.06)', color: '#ba1a1a', fontSize: 13 }}>
            <MaterialIcon name="warning" size={16} />
            <span>{fetchError}</span>
          </div>
        ) : null}

        <header className="page-section-header">
          <p className="ui-body-lg analytics-intro">根据当前账号的真实批改记录生成。</p>
          <div className="filter-chip-row" role="toolbar" aria-label="分析时间范围">
            {rangeOptions.map((option) => (
              <button
                key={option.id}
                className={`filter-chip ${range === option.id ? 'is-active' : ''}`}
                type="button"
                aria-pressed={range === option.id}
                onClick={() => setRange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <section className="analytics-kpi-grid">
          <GlassPanel className="analytics-card ui-hover-glow">
            <header>
              <span className="ui-title-md">平均分数</span>
              <MaterialIcon name="trending_up" className="text-primary" />
            </header>
            <div className="analytics-value">
              <strong>{average === null ? '—' : average.toFixed(1)}</strong>
              <span className="ui-label">
                {scopedRecords.length > 0
                  ? `T1 ${task1Average === null ? '—' : task1Average.toFixed(1)} · T2 ${task2Average === null ? '—' : task2Average.toFixed(1)}`
                  : '暂无数据'}
              </span>
            </div>
          </GlassPanel>

          <GlassPanel className="analytics-card ui-hover-glow">
            <header>
              <span className="ui-title-md">练习次数</span>
              <MaterialIcon name="edit_document" className="text-primary" />
            </header>
            <div className="analytics-value">
              <strong>{scopedRecords.length}</strong>
              <span className="ui-label">{scopedRecords.length > 0 ? '真实记录' : '暂无数据'}</span>
            </div>
          </GlassPanel>

          <GlassPanel className="analytics-card ui-hover-glow">
            <header>
              <span className="ui-title-md">当前弱项</span>
              <MaterialIcon name="warning" className="text-error" />
            </header>
            <div className="analytics-value is-text">
              <strong>{weakest ? weakest.shortLabel : '暂无'}</strong>
              <span className="ui-label">{weakest ? weakest.label : '完成批改后生成'}</span>
            </div>
          </GlassPanel>
        </section>

        <GlassPanel className="target-analytics-card ui-hover-glow">
          <GoalStatusPanel records={scopedRecords} profile={profile} />
        </GlassPanel>

        <section className="charts-grid">
          <GlassPanel className="chart-card ui-hover-glow">
            <h2 className="ui-title-md">IELTS 平均分数 (最近7次)</h2>
            <div className="line-chart">
              {trend.line ? (
                <svg preserveAspectRatio="none" viewBox="0 0 100 50">
                  <defs>
                    <linearGradient id="score-gradient" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#0058bc" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#0058bc" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={trend.fill} fill="url(#score-gradient)" />
                  <path d={trend.line} fill="none" stroke="#0058bc" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  {trend.points.map((point, index) => (
                    <circle
                      key={`${point.x}-${point.y}`}
                      className="chart-point"
                      cx={point.x}
                      cy={point.y}
                      fill="#ffffff"
                      r="1.8"
                      stroke="#0058bc"
                      strokeWidth="0.5"
                      tabIndex={0}
                      role="img"
                      aria-label={`第 ${index + 1} 次记录，${point.score.toFixed(1)} 分`}
                    >
                      <title>{`第 ${index + 1} 次：${point.score.toFixed(1)} 分`}</title>
                    </circle>
                  ))}
                </svg>
              ) : (
                <GlassPanel className="empty-state">
                  <p className="ui-body-md">至少完成两次真实批改后显示趋势。</p>
                </GlassPanel>
              )}
              <div className="chart-axis">
                <span>9.0</span>
                <span>7.0</span>
                <span>5.0</span>
                <span>0</span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="chart-card radar-card ui-hover-glow">
            <h2 className="ui-title-md">标准表现</h2>
            <IeltsRadarChart metrics={radarMetrics} />
          </GlassPanel>
        </section>

        <GlassPanel className="chart-card ui-hover-glow">
          <h2 className="ui-title-md">错误分布</h2>
          <ErrorDistributionBars items={errorDistribution} />
        </GlassPanel>

        <GlassPanel level={2} className="plan-card">
          <PracticePlan recommendations={recommendations} />
          {recommendations.length === 0 ? (
            <Link className="ui-secondary-button" href="/practice" style={{ marginTop: 18 }}>
              先完成一篇练习
              <MaterialIcon name="arrow_forward" size={16} />
            </Link>
          ) : null}
        </GlassPanel>
      </section>
    </main>
  )
}
