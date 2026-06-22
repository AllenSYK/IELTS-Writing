'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminTableSkeleton, AdminEmpty, AdminError, AdminBadge, formatAdminDate } from '@/components/admin/AdminUI'
import { useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import type { PastPaperStatus, PastPaperTaskType, PastPaperFrequencyLevel } from '@/lib/past-paper-types'
import { PastPaperStatusLabels, PastPaperTaskTypeLabels, PastPaperFrequencyLabels } from '@/lib/past-paper-types'

type PastPaperItem = {
  id: string
  status: PastPaperStatus
  taskType: PastPaperTaskType
  title: string
  summary: string
  frequencyLevel: PastPaperFrequencyLevel
  sourceType: string
  createdAt: string
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
        actions={<button className="admin-primary-button" type="button" onClick={() => setShowCreate(true)}>新增真题</button>}
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
                  <td>{item.sourceType}</td>
                  <td>{formatAdminDate(item.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
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
    </main>
  )
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
