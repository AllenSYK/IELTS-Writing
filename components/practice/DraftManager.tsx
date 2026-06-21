'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MaterialIcon } from '@/components/app-ui'
import { AsyncButton, useToast } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import {
  DraftErrorMessages,
  DraftLimits,
  deleteManagedDraft,
  draftDisplayTitle,
  draftRemainingSeconds,
  listManagedDrafts,
  type DraftDeleteQuota,
  type DraftRecord
} from '@/lib/writing-drafts'
import {
  Task1ChartLabels,
  Task2EssayLabels,
  Task2TopicLabels,
  normalizeTask1ChartType,
  normalizeTask2EssayType,
  normalizeTask2Topic
} from '@/lib/writing-options'
import type { WritingTaskType } from '@/lib/writing-records'

type DraftTab = WritingTaskType

const tabs: Array<{ id: DraftTab; label: string }> = [
  { id: 'task1', label: 'Task 1' },
  { id: 'task2', label: 'Task 2' },
  { id: 'mock', label: '完整测试' }
]

const emptyQuota: DraftDeleteQuota = {
  timezone: 'Asia/Shanghai',
  dailyLimit: 3,
  used: 0,
  remaining: 3,
  date: ''
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const remaining = safe % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '刚刚'
    : date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
}

function questionSummary(record: DraftRecord) {
  const data = record.draftData
  if (data.kind === 'full_test') {
    return {
      task1: Task1ChartLabels[normalizeTask1ChartType(data.task1.questionType || data.selection.task1ChartType)],
      task2: `${Task2EssayLabels[normalizeTask2EssayType(data.task2.questionType || data.selection.task2EssayType)]} · ${Task2TopicLabels[normalizeTask2Topic(data.task2.topic || data.selection.task2Topic)]}`
    }
  }
  if (record.taskType === 'task1') {
    return {
      task1: Task1ChartLabels[normalizeTask1ChartType(data.task.questionType || data.selection.task1ChartType)]
    }
  }
  return {
    task2: `${Task2EssayLabels[normalizeTask2EssayType(data.task.questionType || data.selection.task2EssayType)]} · ${Task2TopicLabels[normalizeTask2Topic(data.task.topic || data.selection.task2Topic)]}`
  }
}

function DraftCard({
  record,
  onContinue,
  onDelete,
  deleteDisabled
}: {
  record: DraftRecord
  onContinue: (record: DraftRecord) => void
  onDelete: (record: DraftRecord) => void
  deleteDisabled: boolean
}) {
  const summary = questionSummary(record)
  const data = record.draftData

  return (
    <article className="draft-card">
      <div className="draft-card-heading">
        <div>
          <span className="task-badge">
            {record.taskType === 'task1' ? 'Task 1' : record.taskType === 'task2' ? 'Task 2' : '完整测试'}
          </span>
          <h3>{draftDisplayTitle(record)}</h3>
        </div>
        <span className="draft-updated">
          <MaterialIcon name="schedule" size={15} />
          {formatUpdatedAt(record.updatedAt)}
        </span>
      </div>

      {data.kind === 'full_test' ? (
        <div className="draft-full-test-summary">
          <div>
            <strong>Task 1：{summary.task1}</strong>
            <span>{data.task1.wordCount} 词</span>
          </div>
          <div>
            <strong>Task 2：{summary.task2}</strong>
            <span>{data.task2.wordCount} 词</span>
          </div>
        </div>
      ) : (
        <div className="draft-single-summary">
          <span>{record.taskType === 'task1' ? `图表类型：${summary.task1}` : `题型与主题：${summary.task2}`}</span>
          <span>当前字数：{data.task.wordCount}</span>
        </div>
      )}

      <div className="draft-card-meta">
        <span>
          <MaterialIcon name="timer" size={16} />
          剩余 {formatTime(draftRemainingSeconds(record))}
        </span>
        {data.kind === 'full_test' ? (
          <span>
            <MaterialIcon name="functions" size={16} />
            总字数 {data.task1.wordCount + data.task2.wordCount}
          </span>
        ) : null}
      </div>

      <div className="draft-card-actions">
        <button className="ui-primary-button" type="button" onClick={() => onContinue(record)}>
          <MaterialIcon name="edit_note" size={17} />
          继续写作
        </button>
        <button
          className="danger-link draft-delete-button"
          type="button"
          disabled={deleteDisabled}
          onClick={() => onDelete(record)}
        >
          <MaterialIcon name="delete" size={17} />
          删除草稿
        </button>
      </div>
    </article>
  )
}

export function DraftManager({ initialOpen = false }: { initialOpen?: boolean }) {
  const router = useRouter()
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const [open, setOpen] = useState(initialOpen)
  const [activeTab, setActiveTab] = useState<DraftTab>('task1')
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [quota, setQuota] = useState<DraftDeleteQuota>(emptyQuota)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DraftRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadDrafts = useCallback(async (showLoading = true) => {
    if (!userId) return
    if (showLoading) setLoading(true)
    setLoadError('')
    try {
      const payload = await listManagedDrafts()
      setDrafts(payload.drafts)
      setQuota(payload.quota)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '草稿读取失败，请稍后重试。')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    window.queueMicrotask(() => void loadDrafts(false))
  }, [loadDrafts, userId])

  useEffect(() => {
    if (open) window.queueMicrotask(() => void loadDrafts())
  }, [loadDrafts, open])

  const counts = useMemo(
    () => ({
      task1: drafts.filter((draft) => draft.taskType === 'task1').length,
      task2: drafts.filter((draft) => draft.taskType === 'task2').length,
      mock: drafts.filter((draft) => draft.taskType === 'mock').length
    }),
    [drafts]
  )
  const visibleDrafts = useMemo(
    () => drafts.filter((draft) => draft.taskType === activeTab),
    [activeTab, drafts]
  )

  function continueDraft(record: DraftRecord) {
    setOpen(false)
    router.push(`/write/${record.taskType}?draft=${encodeURIComponent(record.id)}`)
  }

  async function confirmDelete() {
    if (!pendingDelete || !userId || deleting) return
    setDeleting(true)
    try {
      const payload = await deleteManagedDraft(userId, pendingDelete.id)
      setDrafts((current) => current.filter((draft) => draft.id !== pendingDelete.id))
      setQuota(payload.quota)
      setPendingDelete(null)
      pushToast({
        kind: 'success',
        title: '草稿已删除',
        message: `今日还可删除 ${payload.quota.remaining} 次。`
      })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      pushToast({
        kind: 'error',
        title: '删除失败',
        message: DraftErrorMessages[code] || (error instanceof Error ? error.message : '请稍后重试。')
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button className="draft-entry-button" type="button" onClick={() => setOpen(true)}>
        <span className="draft-entry-icon">
          <MaterialIcon name="draft" size={22} />
        </span>
        <span>
          <strong>草稿记录</strong>
          <small>查看尚未完成的 Task 1、Task 2 和完整测试</small>
        </span>
        <span className="draft-entry-count">{drafts.length}</span>
        <MaterialIcon name="arrow_forward" size={18} />
      </button>

      <CenteredDialog
        open={open}
        title="草稿记录"
        description="继续尚未完成的写作练习"
        className="draft-manager-dialog"
        bodyClassName="draft-manager-body"
        onClose={() => setOpen(false)}
      >
        <div className="draft-dialog-toolbar">
          <div className="draft-tabs" role="tablist" aria-label="草稿分类">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}（{counts[tab.id]}/{DraftLimits[tab.id]}）
              </button>
            ))}
          </div>
          <p className="draft-delete-quota">今日还可删除 {quota.remaining} 次</p>
        </div>

        {loading ? (
          <div className="draft-dialog-state" role="status">
            <MaterialIcon name="progress_activity" size={24} />
            正在读取草稿…
          </div>
        ) : loadError ? (
          <div className="draft-dialog-state is-error" role="alert">
            <p>{loadError}</p>
            <button className="ui-secondary-button" type="button" onClick={() => void loadDrafts()}>
              重新加载
            </button>
          </div>
        ) : visibleDrafts.length === 0 ? (
          <div className="draft-dialog-state">
            <MaterialIcon name="draft" size={28} />
            <p>目前没有 {activeTab === 'task1' ? 'Task 1' : activeTab === 'task2' ? 'Task 2' : '完整测试'} 草稿</p>
          </div>
        ) : (
          <div className="draft-list">
            {visibleDrafts.map((draft) => (
              <DraftCard
                key={draft.id}
                record={draft}
                deleteDisabled={quota.remaining <= 0}
                onContinue={continueDraft}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </CenteredDialog>

      <CenteredDialog
        open={Boolean(pendingDelete)}
        title="删除这份草稿？"
        description={`删除后无法恢复，且会消耗今日一次删除额度。今日还可删除 ${quota.remaining} 次。`}
        className="draft-delete-dialog"
        onClose={() => {
          if (!deleting) setPendingDelete(null)
        }}
        footer={(
          <>
            <button className="ui-secondary-button" type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <AsyncButton
              className="danger-action-button"
              icon="delete"
              loading={deleting}
              disabled={quota.remaining <= 0}
              onClick={() => void confirmDelete()}
            >
              确认删除
            </AsyncButton>
          </>
        )}
      >
        <p className="ui-body-md">这份草稿将从所有设备中移除。</p>
      </CenteredDialog>
    </>
  )
}
