'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminTableSkeleton, AdminEmpty, AdminError, AdminBadge, formatAdminDate } from '@/components/admin/AdminUI'
import { useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import type {
  PastPaperStatus, PastPaperTaskType, PastPaperFrequencyLevel,
  RecalledExamImportResult, RecalledExamRecord, ExamMode, ExamSession,
  QuestionCompleteness
} from '@/lib/past-paper-types'
import {
  PastPaperStatusLabels, PastPaperTaskTypeLabels, PastPaperFrequencyLabels,
  ExamSessionLabels, ExamModeLabels, CompletenessLabels, ReliabilityLabels,
  PastPaperSourceTypeLabels, Task1VisualTypeLabels, Task2QuestionTypeLabels,
  PastPaperTopicLabels
} from '@/lib/past-paper-types'

type PastPaperItem = {
  id: string
  status: PastPaperStatus
  taskType: PastPaperTaskType
  title: string
  summary: string
  frequencyLevel: PastPaperFrequencyLevel
  sourceType: string
  createdAt: string
  examDate?: string | null
  examSession?: ExamSession
  completeness?: QuestionCompleteness
}

type AdminPastPapersData = {
  success: true
  items: PastPaperItem[]
  total: number
  page: number
  pageSize: number
}

export function AdminPastPapersClient() {
  const { pushToast } = useToast()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showAnalyze, setShowAnalyze] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  const url = `/api/admin/past-papers?page=${page}&pageSize=20${statusFilter ? `&status=${statusFilter}` : ''}`
  const { data, error, isLoading, mutate } = useSWR<AdminPastPapersData>(url, adminJsonFetcher, { keepPreviousData: true })
  const loading = !data && isLoading
  const items = data?.items ?? []
  const total = data?.total ?? 0

  async function handlePublish(id: string) {
    try {
      const res = await fetch(`/api/admin/past-papers/${id}/publish`, { method: 'POST' })
      if (!res.ok) throw new Error()
      pushToast({ kind: 'success', title: '已发布' })
      void mutate()
    } catch {
      pushToast({ kind: 'error', title: '发布失败' })
    }
  }

  async function handleUnpublish(id: string) {
    try {
      const res = await fetch(`/api/admin/past-papers/${id}/unpublish`, { method: 'POST' })
      if (!res.ok) throw new Error()
      pushToast({ kind: 'success', title: '已下架' })
      void mutate()
    } catch {
      pushToast({ kind: 'error', title: '下架失败' })
    }
  }

  async function handleAnalyze(id: string, imageUrl?: string, rawText?: string) {
    try {
      const res = await fetch('/api/admin/past-papers/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: id, imageUrl, rawText })
      })
      const json = await res.json() as { success?: boolean; message?: string }
      if (!res.ok || !json.success) throw new Error(json.message)
      pushToast({ kind: 'success', title: 'AI 分析完成' })
      setShowAnalyze(null)
      void mutate()
    } catch (err) {
      pushToast({ kind: 'error', title: '分析失败', message: err instanceof Error ? err.message : '' })
    }
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader eyebrow="PAST PAPERS" title="真题题库" description="管理 IELTS 真题、AI 分析和发布。"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="admin-secondary-button" type="button" onClick={() => setShowImport(true)}>导入机经</button>
            <button className="admin-primary-button" type="button" onClick={() => setShowCreate(true)}>新增真题</button>
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">全部状态</option>
          {Object.entries(PastPaperStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {error ? <AdminError message="加载失败" onRetry={() => void mutate()} /> : loading ? <AdminTableSkeleton columns={8} rows={8} /> : items.length === 0 ? <AdminEmpty title="暂无真题" message="请新增真题。" /> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>Task 类型</th>
                <th>频率</th>
                <th>状态</th>
                <th>来源</th>
                <th>考试日期</th>
                <th>完整度</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || '—'}</td>
                  <td>{PastPaperTaskTypeLabels[item.taskType] ?? item.taskType}</td>
                  <td><AdminBadge value={PastPaperFrequencyLabels[item.frequencyLevel]} /></td>
                  <td><AdminBadge value={PastPaperStatusLabels[item.status]} /></td>
                  <td>{PastPaperSourceTypeLabels[item.sourceType as keyof typeof PastPaperSourceTypeLabels] ?? item.sourceType}</td>
                  <td>{item.examDate ? formatExamDate(item.examDate) : '—'}</td>
                  <td>{item.completeness ? CompletenessLabels[item.completeness] : '—'}</td>
                  <td>{formatAdminDate(item.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Link className="admin-secondary-button" href={`/admin/past-papers/${item.id}/edit`}>编辑</Link>
                      {item.status !== 'published' && <button className="admin-secondary-button" onClick={() => handlePublish(item.id)}>发布</button>}
                      {item.status === 'published' && <button className="admin-secondary-button" onClick={() => handleUnpublish(item.id)}>下架</button>}
                      <button className="admin-secondary-button" onClick={() => setShowAnalyze(item.id)}>AI 分析</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="admin-secondary-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span style={{ alignSelf: 'center' }}>{page} / {Math.ceil(total / 20)}</span>
          <button className="admin-secondary-button" disabled={items.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      )}

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void mutate() }} />}
      {showAnalyze && <AnalyzeDialog questionId={showAnalyze} onClose={() => setShowAnalyze(null)} onAnalyze={handleAnalyze} />}
      {showImport && <ImportRecalledDialog onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); void mutate() }} />}
    </main>
  )
}

function formatExamDate(dateStr: string): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`
  }
  return dateStr
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { pushToast } = useToast()
  const [form, setForm] = useState({
    title: '', questionText: '', taskType: 'unknown' as string, sourceType: 'curated' as string,
    frequencyLevel: 'normal' as string, summary: ''
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/past-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error()
      pushToast({ kind: 'success', title: '已创建' })
      onCreated()
    } catch {
      pushToast({ kind: 'error', title: '创建失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-layer" onMouseDown={onClose}>
      <section className="confirm-dialog" style={{ maxWidth: 500, width: '90%' }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="ui-title-md">新增真题</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field"><span>标题</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label className="field"><span>题目文字</span><textarea value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} rows={4} required /></label>
          <label className="field"><span>摘要</span><input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
          <label className="field"><span>Task 类型</span>
            <select value={form.taskType} onChange={(e) => setForm({ ...form, taskType: e.target.value })}>
              {Object.entries(PastPaperTaskTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span>来源类型</span>
            <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
              <option value="official">官方真题</option>
              <option value="published_collection">出版合集</option>
              <option value="recalled">考试回忆</option>
              <option value="curated">平台整理</option>
            </select>
          </label>
          <label className="field"><span>频率等级</span>
            <select value={form.frequencyLevel} onChange={(e) => setForm({ ...form, frequencyLevel: e.target.value })}>
              {Object.entries(PastPaperFrequencyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="admin-secondary-button" type="button" onClick={onClose}>取消</button>
            <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? '创建中…' : '创建'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function AnalyzeDialog({ questionId, onClose, onAnalyze }: { questionId: string; onClose: () => void; onAnalyze: (id: string, imageUrl?: string, rawText?: string) => void }) {
  const [mode, setMode] = useState<'text' | 'image'>('text')
  const [rawText, setRawText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      await onAnalyze(questionId, undefined, rawText || undefined)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="dialog-layer" onMouseDown={onClose}>
      <section className="confirm-dialog" style={{ maxWidth: 500, width: '90%' }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="ui-title-md">AI 分析</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className={mode === 'text' ? 'admin-primary-button' : 'admin-secondary-button'} onClick={() => setMode('text')}>文字分析</button>
          <button className={mode === 'image' ? 'admin-primary-button' : 'admin-secondary-button'} onClick={() => setMode('image')}>图片分析</button>
        </div>
        {mode === 'text' ? (
          <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={6} placeholder="粘贴题目文字..." style={{ width: '100%', padding: 8, borderRadius: 8 }} />
        ) : (
          <p className="ui-body-md">图片上传功能请使用管理员上传接口。</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="admin-secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="admin-primary-button" type="button" disabled={analyzing || (mode === 'text' && !rawText.trim())} onClick={handleAnalyze}>
            {analyzing ? '分析中…' : '开始分析'}
          </button>
        </div>
      </section>
    </div>
  )
}

type PreviewRecord = RecalledExamRecord & { selected: boolean; id: string }

function ImportRecalledDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { pushToast } = useToast()
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [rawText, setRawText] = useState('')
  const [defaultYear, setDefaultYear] = useState<number>(2026)
  const [defaultRegion, setDefaultRegion] = useState('')
  const [defaultMode, setDefaultMode] = useState<ExamMode>('unknown')
  const [analyzing, setAnalyzing] = useState(false)
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([])
  const [confirmStatus, setConfirmStatus] = useState<'draft' | 'review_pending'>('draft')
  const [saving, setSaving] = useState(false)

  async function handleAnalyze() {
    if (!rawText.trim()) return
    setAnalyzing(true)
    try {
      const res = await fetch('/api/admin/past-papers/import-recalled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, defaultYear, defaultRegion: defaultRegion || undefined, defaultMode })
      })
      const data = await res.json() as { success?: boolean; analysis?: RecalledExamImportResult; message?: string }
      if (!res.ok || !data.success || !data.analysis) {
        throw new Error(data.message || '分析失败')
      }
      const records: PreviewRecord[] = data.analysis.examRecords.map((r, i) => ({
        ...r,
        selected: true,
        id: `preview-${i}`
      }))
      setPreviewRecords(records)
      setStep('preview')
      pushToast({ kind: 'success', title: `AI 识别到 ${records.length} 条考试记录` })
    } catch (err) {
      pushToast({ kind: 'error', title: '分析失败', message: err instanceof Error ? err.message : '' })
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleConfirm() {
    const selected = previewRecords.filter(r => r.selected)
    if (selected.length === 0) {
      pushToast({ kind: 'warning', title: '请至少选择一条记录' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/past-papers/import-recalled/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: selected.map(r => ({ ...r, selected: undefined, id: undefined })),
          defaultYear,
          status: confirmStatus
        })
      })
      const data = await res.json() as { success?: boolean; setsCreated?: number; questionsCreated?: number; message?: string }
      if (!res.ok || !data.success) throw new Error(data.message || '保存失败')
      pushToast({ kind: 'success', title: `已导入 ${data.setsCreated} 个题组，${data.questionsCreated} 道题目` })
      onImported()
    } catch (err) {
      pushToast({ kind: 'error', title: '导入失败', message: err instanceof Error ? err.message : '' })
    } finally {
      setSaving(false)
    }
  }

  function toggleRecord(id: string) {
    setPreviewRecords(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r))
  }

  function toggleAll() {
    const allSelected = previewRecords.every(r => r.selected)
    setPreviewRecords(prev => prev.map(r => ({ ...r, selected: !allSelected })))
  }

  return (
    <div className="dialog-layer" onMouseDown={onClose}>
      <section className="confirm-dialog" style={{ maxWidth: 900, width: '95%', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="ui-title-md">导入机经/考场回忆</h2>

        {step === 'input' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field">
              <span>原始机经文本</span>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                placeholder={`粘贴机经内容，例如：\n\n6月20日上午场\n小作文：三个国家的游客数量折线图，具体数据不全\n大作文：Some people think...`}
                style={{ width: '100%', padding: 8, borderRadius: 8, fontFamily: 'monospace', fontSize: 13 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>
                <span>默认年份（未标注时使用）</span>
                <select value={defaultYear} onChange={(e) => setDefaultYear(Number(e.target.value))}>
                  {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 150px' }}>
                <span>默认地区</span>
                <input value={defaultRegion} onChange={(e) => setDefaultRegion(e.target.value)} placeholder="如：中国大陆" />
              </label>
              <label className="field" style={{ flex: '1 1 150px' }}>
                <span>默认考试形式</span>
                <select value={defaultMode} onChange={(e) => setDefaultMode(e.target.value as ExamMode)}>
                  {Object.entries(ExamModeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="admin-secondary-button" type="button" onClick={onClose}>取消</button>
              <button className="admin-primary-button" type="button" disabled={analyzing || !rawText.trim()} onClick={handleAnalyze}>
                {analyzing ? 'AI 分析中…' : '开始分析'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="admin-secondary-button" type="button" onClick={() => setStep('input')}>返回修改</button>
              <button className="admin-secondary-button" type="button" onClick={toggleAll}>
                {previewRecords.every(r => r.selected) ? '取消全选' : '全选'}
              </button>
              <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                已选 {previewRecords.filter(r => r.selected).length} / {previewRecords.length}
              </span>
              <select value={confirmStatus} onChange={(e) => setConfirmStatus(e.target.value as 'draft' | 'review_pending')} style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: 6, fontSize: 13 }}>
                <option value="draft">保存为草稿</option>
                <option value="review_pending">提交审核</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflow: 'auto' }}>
              {previewRecords.map((record, index) => (
                <PreviewRecordCard
                  key={record.id}
                  record={record}
                  index={index}
                  onToggle={() => toggleRecord(record.id)}
                  defaultYear={defaultYear}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="admin-secondary-button" type="button" onClick={onClose}>取消</button>
              <button className="admin-primary-button" type="button" disabled={saving || previewRecords.filter(r => r.selected).length === 0} onClick={handleConfirm}>
                {saving ? '保存中…' : `确认导入 (${previewRecords.filter(r => r.selected).length})`}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function PreviewRecordCard({ record, onToggle, defaultYear }: { record: PreviewRecord; index: number; onToggle: () => void; defaultYear: number }) {
  const examDate = record.examDate || (defaultYear ? `${defaultYear}-xx-xx` : '未知')
  return (
    <div style={{
      padding: 12, borderRadius: 8, border: '1px solid var(--outline-variant)',
      background: record.selected ? 'var(--surface-container-lowest)' : 'var(--surface-container)',
      opacity: record.selected ? 1 : 0.6
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <input type="checkbox" checked={record.selected} onChange={onToggle} style={{ marginTop: 4 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <span className="task-badge">{formatExamDate(examDate)}</span>
            <span className="task-badge">{ExamSessionLabels[record.examSession]}</span>
            <span className="task-badge">{ExamModeLabels[record.examMode]}</span>
            {record.examRegion && <span className="task-badge">{record.examRegion}</span>}
            <span className="task-badge">{ReliabilityLabels[record.reliability]}</span>
          </div>

          {record.task1 && (
            <div style={{ marginBottom: 8, padding: 8, borderRadius: 6, background: 'var(--surface-container)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Task 1</span>
                <span className="task-badge" style={{ fontSize: 11 }}>{CompletenessLabels[record.task1.completeness]}</span>
                {record.task1.visualTypes?.map(v => (
                  <span key={v} className="task-badge" style={{ fontSize: 11 }}>{Task1VisualTypeLabels[v as keyof typeof Task1VisualTypeLabels] ?? v}</span>
                ))}
              </div>
              <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface-variant)' }}>
                {record.task1.summary || record.task1.questionText || '无题目内容'}
              </p>
              {record.task1.missingFields?.length > 0 && (
                <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--error)' }}>
                  缺失：{record.task1.missingFields.join('、')}
                </p>
              )}
              {record.task1.uncertainties?.length > 0 && (
                <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--tertiary)' }}>
                  不确定：{record.task1.uncertainties.join('、')}
                </p>
              )}
            </div>
          )}

          {record.task2 && (
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--surface-container)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Task 2</span>
                <span className="task-badge" style={{ fontSize: 11 }}>{CompletenessLabels[record.task2.completeness]}</span>
                <span className="task-badge" style={{ fontSize: 11 }}>{Task2QuestionTypeLabels[record.task2.questionType] ?? record.task2.questionType}</span>
              </div>
              <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface-variant)' }}>
                {record.task2.questionText ? record.task2.questionText.slice(0, 200) : '无题目内容'}
              </p>
              {record.task2.primaryTopic && (
                <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--primary)' }}>
                  主题：{PastPaperTopicLabels[record.task2.primaryTopic] ?? record.task2.primaryTopic}
                  {record.task2.secondaryTopics?.length > 0 && ` + ${record.task2.secondaryTopics.map(t => PastPaperTopicLabels[t] ?? t).join('、')}`}
                </p>
              )}
              {record.task2.missingFields?.length > 0 && (
                <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--error)' }}>
                  缺失：{record.task2.missingFields.join('、')}
                </p>
              )}
            </div>
          )}

          {!record.task1 && !record.task2 && (
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>未识别到 Task 1 或 Task 2</p>
          )}

          {record.sourceNotes && (
            <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--on-surface-variant)' }}>来源备注：{record.sourceNotes}</p>
          )}
        </div>
      </div>
    </div>
  )
}
