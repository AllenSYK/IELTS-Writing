'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MaterialIcon } from '@/components/app-ui'
import { AsyncButton, useToast } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import {
  DraftErrorMessages,
  DraftLimits,
  deleteManagedDraft,
  fetchDraftDeleteQuota,
  fetchManagedDraft,
  listDraftsLightweight,
  type DraftDeleteQuota,
  type DraftListItem
} from '@/lib/writing-drafts'
import type { WritingTaskType } from '@/lib/writing-records'

type DraftTab = WritingTaskType

const tabs: Array<{ id: DraftTab; label: string }> = [
  { id: 'task1', label: 'Task 1' },
  { id: 'task2', label: 'Task 2' },
  { id: 'mock', label: '完整测试' }
]

const emptyQuota: DraftDeleteQuota = {
  timezone: 'Asia/Shanghai',
  dailyLimit: 8,
  used: 0,
  remaining: 8,
  date: ''
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

function DraftCard({
  record,
  onContinue,
  onDelete,
  deleteDisabled
}: {
  record: DraftListItem
  onContinue: (record: DraftListItem) => void
  onDelete: (record: DraftListItem) => void
  deleteDisabled: boolean
}) {
  const taskLabel = record.taskType === 'task1' ? 'Task 1' : record.taskType === 'task2' ? 'Task 2' : '完整测试'

  return (
    <article className="draft-card">
      <div className="draft-card-heading">
        <div>
          <span className="task-badge">{taskLabel}</span>
          <h3>{taskLabel} 草稿</h3>
        </div>
        <span className="draft-updated">
          <MaterialIcon name="schedule" size={15} />
          {formatUpdatedAt(record.updatedAt)}
        </span>
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
  const [drafts, setDrafts] = useState<DraftListItem[]>([])
  const [quota, setQuota] = useState<DraftDeleteQuota>(emptyQuota)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DraftListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [quotaLoaded, setQuotaLoaded] = useState(false)
  const hasLoadedRef = useRef(false)
  const quotaLoadedRef = useRef(false)

  const loadDrafts = useCallback(async () => {
    if (!userId) return
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true
    setLoading(true)
    setLoadError('')
    try {
      const items = await listDraftsLightweight()
      setDrafts(items)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '草稿读取失败，请稍后重试。')
      hasLoadedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [userId])

  const loadQuota = useCallback(async () => {
    if (quotaLoadedRef.current) return
    quotaLoadedRef.current = true
    const q = await fetchDraftDeleteQuota()
    setQuota(q)
    setQuotaLoaded(true)
  }, [])

  useEffect(() => {
    if (!userId || !open) return
    // 使用 setTimeout 避免在 effect 中直接调用 setState
    const timer = setTimeout(() => {
      void loadDrafts()
    }, 0)
    return () => clearTimeout(timer)
  }, [userId, open, loadDrafts])

  const counts = {
    task1: drafts.filter((d) => d.taskType === 'task1').length,
    task2: drafts.filter((d) => d.taskType === 'task2').length,
    mock: drafts.filter((d) => d.taskType === 'mock').length
  }
  const visibleDrafts = drafts.filter((d) => d.taskType === activeTab)

  async function continueDraft(record: DraftListItem) {
    setOpen(false)
    router.push(`/write/${record.taskType}?draft=${encodeURIComponent(record.id)}`)
  }

  async function confirmDelete() {
    if (!pendingDelete || !userId || deleting) return
    setDeleting(true)
    try {
      const payload = await deleteManagedDraft(userId, pendingDelete.id)
      setDrafts((current) => current.filter((d) => d.id !== pendingDelete.id))
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

  function handleDeleteClick(record: DraftListItem) {
    setPendingDelete(record)
    void loadQuota()
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
            <button className="ui-secondary-button" type="button" onClick={() => { hasLoadedRef.current = false; void loadDrafts() }}>
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
                deleteDisabled={quota.remaining <= 0 && quotaLoaded}
                onContinue={continueDraft}
                onDelete={handleDeleteClick}
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
              disabled={quota.remaining <= 0 && quotaLoaded}
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
