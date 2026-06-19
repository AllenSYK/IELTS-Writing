'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ErrorDistributionBars } from '@/components/analytics/ErrorDistributionBars'
import { GoalStatusPanel } from '@/components/analytics/GoalStatusPanel'
import { IeltsRadarChart } from '@/components/analytics/IeltsRadarChart'
import { PracticePlan } from '@/components/analytics/PracticePlan'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { GlassPanel, MaterialIcon } from '@/components/stitch-ui'
import {
  buildErrorDistribution,
  buildPracticeRecommendations,
  buildRadarMetrics
} from '@/lib/learning-analytics'
import { averageTaskBand } from '@/lib/ielts-scoring'
import {
  averageScore,
  scoreValue,
  type WritingRecord
} from '@/lib/writing-records'
import { UserRouteCacheKeys, useUserWritingRecords } from '@/lib/user-route-cache'
import { useUserProfile } from '@/stores/user-profile-store'

type AnalyticsRange = '7' | '30' | 'all'

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

export default function AnalyticsPage() {
  const { profile } = useUserProfile()
  const { records, isLoading } = useUserWritingRecords(UserRouteCacheKeys.level0)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [range, setRange] = useState<AnalyticsRange>('30')
  const [now, setNow] = useState(0)

  useEffect(() => {
    window.queueMicrotask(() => {
      setRange((window.localStorage.getItem('aerowrite-analytics-range') as AnalyticsRange | null) || '30')
      setNow(Date.now())
      setPreferencesLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (preferencesLoaded) window.localStorage.setItem('aerowrite-analytics-range', range)
  }, [preferencesLoaded, range])

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

  if (!preferencesLoaded || isLoading) return <PageSkeleton />

  const rangeOptions: Array<{ id: AnalyticsRange; label: string }> = [
    { id: '7', label: '近7天' },
    { id: '30', label: '近30天' },
    { id: 'all', label: '全部' }
  ]

  return (
    <main className="stitch-page" data-main-content tabIndex={-1}>
      <section className="analytics-main">
        <header className="page-section-header">
          <p className="stitch-body-lg analytics-intro">基于本机真实批改记录统计，不使用示例趋势。</p>
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
          <GlassPanel className="analytics-card stitch-hover-glow">
            <header>
              <span className="stitch-title-md">平均分数</span>
              <MaterialIcon name="trending_up" className="text-primary" />
            </header>
            <div className="analytics-value">
              <strong>{average === null ? '—' : average.toFixed(1)}</strong>
              <span className="stitch-label">
                {scopedRecords.length > 0
                  ? `T1 ${task1Average === null ? '—' : task1Average.toFixed(1)} · T2 ${task2Average === null ? '—' : task2Average.toFixed(1)}`
                  : '暂无数据'}
              </span>
            </div>
          </GlassPanel>

          <GlassPanel className="analytics-card stitch-hover-glow">
            <header>
              <span className="stitch-title-md">练习次数</span>
              <MaterialIcon name="edit_document" className="text-primary" />
            </header>
            <div className="analytics-value">
              <strong>{scopedRecords.length}</strong>
              <span className="stitch-label">{scopedRecords.length > 0 ? '真实记录' : '暂无数据'}</span>
            </div>
          </GlassPanel>

          <GlassPanel className="analytics-card stitch-hover-glow">
            <header>
              <span className="stitch-title-md">当前弱项</span>
              <MaterialIcon name="warning" className="text-error" />
            </header>
            <div className="analytics-value is-text">
              <strong>{weakest ? weakest.shortLabel : '暂无'}</strong>
              <span className="stitch-label">{weakest ? weakest.label : '完成批改后生成'}</span>
            </div>
          </GlassPanel>
        </section>

        <GlassPanel className="target-analytics-card stitch-hover-glow">
          <GoalStatusPanel records={scopedRecords} profile={profile} />
        </GlassPanel>

        <section className="charts-grid">
          <GlassPanel className="chart-card stitch-hover-glow">
            <h2 className="stitch-title-md">IELTS 平均分数 (最近7次)</h2>
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
                  <p className="stitch-body-md">至少完成两次真实批改后显示趋势。</p>
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

          <GlassPanel className="chart-card radar-card stitch-hover-glow">
            <h2 className="stitch-title-md">标准表现</h2>
            <IeltsRadarChart metrics={radarMetrics} />
          </GlassPanel>
        </section>

        <GlassPanel className="chart-card stitch-hover-glow">
          <h2 className="stitch-title-md">错误分布</h2>
          <ErrorDistributionBars items={errorDistribution} />
        </GlassPanel>

        <GlassPanel level={2} className="plan-card">
          <PracticePlan recommendations={recommendations} />
          {recommendations.length === 0 ? (
            <Link className="stitch-secondary-button" href="/practice" style={{ marginTop: 18 }}>
              先完成一篇练习
              <MaterialIcon name="arrow_forward" size={16} />
            </Link>
          ) : null}
        </GlassPanel>
      </section>
    </main>
  )
}
