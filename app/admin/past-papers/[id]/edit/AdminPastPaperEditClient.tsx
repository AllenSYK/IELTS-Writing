'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminTableSkeleton, AdminError } from '@/components/admin/AdminUI'
import { useToast } from '@/components/interaction-system'
import type {
  PastPaperStatus, PastPaperTaskType, PastPaperSourceType, PastPaperFrequencyLevel,
  PastPaperDifficulty, Task1VisualType, ExamSession, ExamMode, QuestionCompleteness,
  SourceReliability
} from '@/lib/past-paper-types'
import {
  PastPaperStatusLabels, PastPaperTaskTypeLabels, PastPaperSourceTypeLabels,
  PastPaperFrequencyLabels, PastPaperDifficultyLabels, Task1VisualTypeLabels,
  Task2QuestionTypeLabels, PastPaperTopicLabels, ExamSessionLabels, ExamModeLabels,
  CompletenessLabels, ReliabilityLabels
} from '@/lib/past-paper-types'

type QuestionData = {
  id: string
  status: PastPaperStatus
  taskType: PastPaperTaskType
  title: string
  questionText: string
  summary: string
  sourceType: PastPaperSourceType
  sourceName: string | null
  sourceYear: number | null
  sourceReference: string | null
  frequencyLevel: PastPaperFrequencyLevel
  frequencySource: string
  difficulty: PastPaperDifficulty | null
  task1VisualTypes: Task1VisualType[] | null
  task2QuestionType: string | null
  topics: string[]
  keywords: string[]
  showSourceImage: boolean
  updatedAt: string
  examDate: string | null
  examSession: ExamSession
  examTimeLocal: string | null
  examTimezone: string | null
  examMode: ExamMode
  examCountry: string | null
  examRegion: string | null
  examCity: string | null
  venueNote: string | null
  completeness: QuestionCompleteness
  missingFields: string[]
  uncertainties: string[]
  primaryTopic: string | null
  secondaryTopics: string[]
  sourceNote: string | null
  sourceUrl: string | null
  sourceDate: string | null
  sourceReliability: SourceReliability
  showSourceToUsers: boolean
  internalNote: string | null
  userNote: string | null
  tags: string[]
  isFeatured: boolean
  isPinned: boolean
  isRecommended: boolean
  sortWeight: number
  isVisible: boolean
}

export function AdminPastPaperEditClient({ questionId }: { questionId: string }) {
  const router = useRouter()
  const { pushToast } = useToast()
  const [question, setQuestion] = useState<QuestionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const originalRef = useRef<string>('')

  const fetchQuestion = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/past-papers/${questionId}`)
      const data = await res.json() as { success?: boolean; question?: QuestionData; message?: string }
      if (!res.ok || !data.success || !data.question) throw new Error(data.message || 'Failed to load')
      setQuestion(data.question)
      originalRef.current = JSON.stringify(data.question)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [questionId])

  useEffect(() => { void fetchQuestion() }, [fetchQuestion])

  useEffect(() => {
    if (!question) return
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, question])

  function update<K extends keyof QuestionData>(key: K, value: QuestionData[K]) {
    setQuestion((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      setDirty(JSON.stringify(next) !== originalRef.current)
      return next
    })
  }

  async function handleSave(statusOverride?: PastPaperStatus) {
    if (!question || saving) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: question.title,
        questionText: question.questionText,
        summary: question.summary,
        taskType: question.taskType,
        sourceType: question.sourceType,
        sourceName: question.sourceName,
        sourceYear: question.sourceYear,
        sourceReference: question.sourceReference,
        frequencyLevel: question.frequencyLevel,
        frequencySource: question.frequencySource,
        difficulty: question.difficulty,
        topics: question.topics,
        keywords: question.keywords,
        task1VisualTypes: question.task1VisualTypes,
        task2QuestionType: question.task2QuestionType,
        showSourceImage: question.showSourceImage,
        sourceNote: question.sourceNote,
        sourceUrl: question.sourceUrl,
        sourceDate: question.sourceDate,
        sourceReliability: question.sourceReliability,
        showSourceToUsers: question.showSourceToUsers,
        internalNote: question.internalNote,
        userNote: question.userNote,
        tags: question.tags,
        isFeatured: question.isFeatured,
        isPinned: question.isPinned,
        isRecommended: question.isRecommended,
        sortWeight: question.sortWeight,
        isVisible: question.isVisible,
        completeness: question.completeness,
        missingFields: question.missingFields,
        uncertainties: question.uncertainties,
        primaryTopic: question.primaryTopic,
        secondaryTopics: question.secondaryTopics,
        examDate: question.examDate,
        examSession: question.examSession,
        examTimeLocal: question.examTimeLocal,
        examTimezone: question.examTimezone,
        examMode: question.examMode,
        examCountry: question.examCountry,
        examRegion: question.examRegion,
        examCity: question.examCity,
        venueNote: question.venueNote,
        expectedUpdatedAt: question.updatedAt
      }
      if (statusOverride) body.status = statusOverride

      const res = await fetch(`/api/admin/past-papers/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json() as { success?: boolean; question?: QuestionData; code?: string; message?: string }

      if (res.status === 409 || data.code === 'CONFLICT') {
        pushToast({ kind: 'error', title: '保存冲突', message: data.message || '该题目已被其他管理员更新，请刷新后重新编辑。' })
        return
      }
      if (!res.ok || !data.success) throw new Error(data.message || '保存失败')

      if (data.question) {
        setQuestion(data.question)
        originalRef.current = JSON.stringify(data.question)
      }
      setDirty(false)

      const statusMsg = statusOverride === 'unpublished' ? '并已下架' : statusOverride === 'draft' ? '并转为草稿' : '，并继续保持发布状态'
      pushToast({ kind: 'success', title: '题目已更新', message: question.status === 'published' && !statusOverride ? statusMsg : undefined })
    } catch (err) {
      pushToast({ kind: 'error', title: '保存失败', message: err instanceof Error ? err.message : '请稍后重试。' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <AdminTableSkeleton columns={1} rows={8} />
  if (error) return <AdminError message={error} onRetry={() => void fetchQuestion()} />
  if (!question) return <AdminError message="题目未找到" />

  const isTask1 = question.taskType.startsWith('task1')
  const isTask2 = question.taskType === 'task2'

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="EDIT QUESTION"
        title="编辑题目"
        description={`ID: ${question.id}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="admin-secondary-button" href="/admin/past-papers">返回列表</Link>
            <button className="admin-secondary-button" type="button" onClick={() => void fetchQuestion()}>刷新</button>
          </div>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="admin-status good">{PastPaperStatusLabels[question.status]}</span>
        <span className="admin-status neutral">{PastPaperTaskTypeLabels[question.taskType]}</span>
        <span className="admin-status neutral">{PastPaperFrequencyLabels[question.frequencyLevel]}</span>
        {question.frequencySource === 'ai_suggested' && <span className="admin-status neutral">AI 建议</span>}
        {dirty && <span className="admin-status warning">未保存</span>}
      </div>

      <section style={{ display: 'grid', gap: 20 }}>
        <FormSection title="基本信息">
          <Field label="题目标题">
            <input value={question.title} onChange={(e) => update('title', e.target.value)} maxLength={500} />
          </Field>
          <Field label="Task 类型">
            <select value={question.taskType} onChange={(e) => update('taskType', e.target.value as PastPaperTaskType)}>
              {Object.entries(PastPaperTaskTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="题目正文">
            <textarea value={question.questionText} onChange={(e) => update('questionText', e.target.value)} rows={8} maxLength={10000} />
          </Field>
          <Field label="简短摘要">
            <textarea value={question.summary} onChange={(e) => update('summary', e.target.value)} rows={3} maxLength={2000} />
          </Field>
        </FormSection>

        <FormSection title="频率分类">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="频率分类">
              <select value={question.frequencyLevel} onChange={(e) => update('frequencyLevel', e.target.value as PastPaperFrequencyLevel)}>
                {Object.entries(PastPaperFrequencyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="频率来源">
              <select value={question.frequencySource} onChange={(e) => update('frequencySource', e.target.value)}>
                <option value="admin">管理员设定</option>
                <option value="ai_suggested">AI 建议</option>
                <option value="imported">导入</option>
                <option value="unknown">未分类</option>
              </select>
            </Field>
          </div>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>
            用于真题题库的频率筛选与标签展示，不代表官方考试预测。
          </p>
        </FormSection>

        <FormSection title="来源信息">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="来源类型">
              <select value={question.sourceType} onChange={(e) => update('sourceType', e.target.value as PastPaperSourceType)}>
                {Object.entries(PastPaperSourceTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="来源名称">
              <input value={question.sourceName ?? ''} onChange={(e) => update('sourceName', e.target.value || null)} maxLength={200} placeholder="如 Cambridge IELTS 18" />
            </Field>
            <Field label="来源年份">
              <input type="number" value={question.sourceYear ?? ''} onChange={(e) => update('sourceYear', e.target.value ? Number(e.target.value) : null)} min={1990} max={2030} />
            </Field>
            <Field label="来源可信度">
              <select value={question.sourceReliability} onChange={(e) => update('sourceReliability', e.target.value as SourceReliability)}>
                {Object.entries(ReliabilityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="来源说明">
            <textarea value={question.sourceNote ?? ''} onChange={(e) => update('sourceNote', e.target.value || null)} rows={2} maxLength={2000} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="来源链接（仅管理员可见）">
              <input value={question.sourceUrl ?? ''} onChange={(e) => update('sourceUrl', e.target.value || null)} maxLength={500} placeholder="https://" />
            </Field>
            <Field label="来源日期">
              <input type="date" value={question.sourceDate ?? ''} onChange={(e) => update('sourceDate', e.target.value || null)} />
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={question.showSourceToUsers} onChange={(e) => update('showSourceToUsers', e.target.checked)} />
            向普通用户展示来源信息
          </label>
        </FormSection>

        <FormSection title="考试信息">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Field label="考试日期">
              <input type="date" value={question.examDate ?? ''} onChange={(e) => update('examDate', e.target.value || null)} />
            </Field>
            <Field label="考试场次">
              <select value={question.examSession} onChange={(e) => update('examSession', e.target.value as ExamSession)}>
                {Object.entries(ExamSessionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="考试形式">
              <select value={question.examMode} onChange={(e) => update('examMode', e.target.value as ExamMode)}>
                {Object.entries(ExamModeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="具体时间">
              <input value={question.examTimeLocal ?? ''} onChange={(e) => update('examTimeLocal', e.target.value || null)} maxLength={20} placeholder="如 09:00" />
            </Field>
            <Field label="国家/地区">
              <input value={question.examCountry ?? ''} onChange={(e) => update('examCountry', e.target.value || null)} maxLength={100} />
            </Field>
            <Field label="地区">
              <input value={question.examRegion ?? ''} onChange={(e) => update('examRegion', e.target.value || null)} maxLength={100} />
            </Field>
            <Field label="城市">
              <input value={question.examCity ?? ''} onChange={(e) => update('examCity', e.target.value || null)} maxLength={100} />
            </Field>
            <Field label="时区">
              <input value={question.examTimezone ?? ''} onChange={(e) => update('examTimezone', e.target.value || null)} maxLength={50} placeholder="如 Asia/Shanghai" />
            </Field>
          </div>
          <Field label="考点备注">
            <input value={question.venueNote ?? ''} onChange={(e) => update('venueNote', e.target.value || null)} maxLength={500} />
          </Field>
        </FormSection>

        <FormSection title="题目完整度">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="完整度">
              <select value={question.completeness} onChange={(e) => update('completeness', e.target.value as QuestionCompleteness)}>
                {Object.entries(CompletenessLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="难度">
              <select value={question.difficulty ?? ''} onChange={(e) => update('difficulty', (e.target.value || null) as PastPaperDifficulty | null)}>
                <option value="">未设置</option>
                {Object.entries(PastPaperDifficultyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="缺失内容（每行一条）">
            <textarea
              value={(question.missingFields ?? []).join('\n')}
              onChange={(e) => update('missingFields', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              rows={3}
              placeholder="如：具体数据&#10;图表原图"
            />
          </Field>
          <Field label="不确定内容（每行一条）">
            <textarea
              value={(question.uncertainties ?? []).join('\n')}
              onChange={(e) => update('uncertainties', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              rows={3}
            />
          </Field>
        </FormSection>

        {isTask1 && (
          <FormSection title="Task 1 专属字段">
            <Field label="图表类型（多选）">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(Task1VisualTypeLabels).map(([k, v]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={(question.task1VisualTypes ?? []).includes(k as Task1VisualType)}
                      onChange={(e) => {
                        const current = question.task1VisualTypes ?? []
                        update('task1VisualTypes', e.target.checked ? [...current, k as Task1VisualType] : current.filter(t => t !== k))
                      }}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={question.showSourceImage} onChange={(e) => update('showSourceImage', e.target.checked)} />
              显示原始图片
            </label>
          </FormSection>
        )}

        {isTask2 && (
          <FormSection title="Task 2 专属字段">
            <Field label="题型">
              <select value={question.task2QuestionType ?? ''} onChange={(e) => update('task2QuestionType', e.target.value || null)}>
                <option value="">未设置</option>
                {Object.entries(Task2QuestionTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="主主题">
                <select value={question.primaryTopic ?? ''} onChange={(e) => update('primaryTopic', e.target.value || null)}>
                  <option value="">未设置</option>
                  {Object.entries(PastPaperTopicLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="关键词（逗号分隔）">
                <input
                  value={question.keywords.join(', ')}
                  onChange={(e) => update('keywords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  maxLength={500}
                />
              </Field>
            </div>
            <Field label="次级主题（多选）">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(PastPaperTopicLabels).map(([k, v]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={(question.secondaryTopics ?? []).includes(k)}
                      onChange={(e) => {
                        const current = question.secondaryTopics ?? []
                        update('secondaryTopics', e.target.checked ? [...current, k] : current.filter(t => t !== k))
                      }}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </Field>
          </FormSection>
        )}

        <FormSection title="分类标签">
          <Field label="主题标签（多选）">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(PastPaperTopicLabels).map(([k, v]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={question.topics.includes(k)}
                    onChange={(e) => {
                      const current = question.topics
                      update('topics', e.target.checked ? [...current, k] : current.filter(t => t !== k))
                    }}
                  />
                  {v}
                </label>
              ))}
            </div>
          </Field>
          <Field label="自定义标签（逗号分隔）">
            <input
              value={question.tags.join(', ')}
              onChange={(e) => update('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              maxLength={500}
              placeholder="如：高频考点、2025真题"
            />
          </Field>
        </FormSection>

        <FormSection title="发布与展示">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={question.isFeatured} onChange={(e) => update('isFeatured', e.target.checked)} />
              精选题目
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={question.isPinned} onChange={(e) => update('isPinned', e.target.checked)} />
              置顶
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={question.isRecommended} onChange={(e) => update('isRecommended', e.target.checked)} />
              推荐
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={question.isVisible} onChange={(e) => update('isVisible', e.target.checked)} />
              用户端可见
            </label>
          </div>
          <Field label="排序权重">
            <input type="number" value={question.sortWeight} onChange={(e) => update('sortWeight', Number(e.target.value))} min={-9999} max={9999} />
          </Field>
          <Field label="用户端说明">
            <textarea value={question.userNote ?? ''} onChange={(e) => update('userNote', e.target.value || null)} rows={2} maxLength={2000} placeholder="向用户展示的额外说明" />
          </Field>
          <Field label="内部备注（仅管理员可见）">
            <textarea value={question.internalNote ?? ''} onChange={(e) => update('internalNote', e.target.value || null)} rows={2} maxLength={5000} />
          </Field>
        </FormSection>
      </section>

      <div style={{
        position: 'sticky', bottom: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: '16px 0', marginTop: 24,
        borderTop: '1px solid var(--outline-variant)',
        background: 'var(--surface)', paddingTop: 16
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="admin-primary-button"
            type="button"
            disabled={saving || !dirty}
            onClick={() => void handleSave()}
          >
            {saving ? '正在保存…' : '保存修改'}
          </button>
          {question.status === 'published' && (
            <button
              className="admin-secondary-button"
              type="button"
              disabled={saving}
              onClick={() => {
                if (confirm('确定要下架此题目吗？下架后用户将无法看到。')) void handleSave('unpublished')
              }}
            >
              保存并下架
            </button>
          )}
          {question.status !== 'draft' && (
            <button
              className="admin-secondary-button"
              type="button"
              disabled={saving}
              onClick={() => {
                if (confirm('确定转为草稿吗？将从用户端消失。')) void handleSave('draft')
              }}
            >
              保存为草稿
            </button>
          )}
        </div>
        <Link className="admin-secondary-button" href="/admin/past-papers">取消</Link>
      </div>
    </main>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="admin-panel" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--on-surface)' }}>{title}</h3>
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
      <span style={{ color: 'var(--on-surface-variant)', fontWeight: 600, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  )
}
