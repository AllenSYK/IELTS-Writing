'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast } from '@/components/interaction-system'
import {
  DefaultPromptSelection,
  Task1ChartLabels,
  type Task1ChartType,
  Task1SubtypeLabels,
  Task2EssayLabels,
  type Task2EssayType,
  Task2TopicLabels,
  type Task2Topic,
  searchParamsForSelection,
  selectedTask1SubtypeOptions,
  type PromptSelection
} from '@/lib/writing-options'
import type { WritingTaskType } from '@/lib/writing-records'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { userScopedStorageKey } from '@/lib/user-storage'
import { createDraftRequestId, createManagedDraft, DraftErrorMessages } from '@/lib/writing-drafts'
import { UploadedTaskPanel } from '@/components/practice/UploadedTaskPanel'
import { DraftManager } from '@/components/practice/DraftManager'
import { CenteredDialog } from '@/components/ui/CenteredDialog'

type ModeCard = {
  mode: WritingTaskType
  icon: string
  minutes: string
  title: string
  subtitle: string
  words: string
  action: string
  primary?: boolean
  featured?: boolean
  recommended?: boolean
}

function buildHref(mode: WritingTaskType, selection: PromptSelection) {
  const params = searchParamsForSelection(mode, selection)
  const query = params.toString()
  return `/write/${mode}${query ? `?${query}` : ''}`
}

const primaryTask1Types: Task1ChartType[] = ['random', 'line_chart', 'bar_chart', 'pie_chart', 'table', 'process', 'map', 'mixed_charts']
const advancedTask1Types: Task1ChartType[] = ['floor_plan', 'dynamic_chart', 'static_comparison', 'before_after']
const primaryTask2Types: Task2EssayType[] = ['random', 'agree_disagree', 'discussion_opinion', 'advantages_disadvantages', 'problem_solution']
const advancedTask2Types: Task2EssayType[] = ['outweigh', 'cause_solution', 'two_part', 'positive_negative', 'direct_question']
const primaryTopics: Task2Topic[] = ['random', 'education', 'technology', 'environment', 'society', 'health', 'work', 'culture']
const advancedTopics: Task2Topic[] = ['government', 'globalization', 'media_advertising', 'transport', 'urban_development', 'crime', 'family', 'teenagers']

const compactLabels: Partial<Record<Task1ChartType | Task2EssayType | Task2Topic | PromptSelection['task1Subtype'], string>> = {
  random: '随机',
  discussion_opinion: '讨论双方',
  advantages_disadvantages: '优缺点',
  problem_solution: '问题与解决',
  cause_solution: '原因与解决',
  two_part: '双问题',
  positive_negative: '积极/消极',
  direct_question: '直接问题',
  floor_plan: '平面图',
  mixed_charts: '组合图',
  dynamic_chart: '动态图',
  static_comparison: '静态对比',
  before_after: '前后对比',
  media_advertising: '媒体广告',
  urban_development: '城市发展',
  globalization: '全球化',
  government: '政府',
  teenagers: '青少年'
}

function compactLabel<T extends string>(value: T, label: string) {
  return compactLabels[value as keyof typeof compactLabels] ?? label
}

function Chip({
  selected,
  label,
  title,
  onClick
}: {
  selected: boolean
  label: string
  title?: string
  onClick: () => void
}) {
  return (
    <button className={`choice-chip ${selected ? 'is-active' : ''}`} type="button" title={title} aria-pressed={selected} onClick={onClick}>
      {selected ? <MaterialIcon name="check" size={15} /> : null}
      {label}
    </button>
  )
}

function PracticeSettingRow({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="practice-setting-row" aria-label={title}>
      <div className="practice-setting-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="practice-setting-control">{children}</div>
    </section>
  )
}

export function WritingModeSelector({
  modes,
  initialDraftsOpen = false,
  initialDraftTab = 'task1'
}: {
  modes: ModeCard[]
  initialDraftsOpen?: boolean
  initialDraftTab?: WritingTaskType
}) {
  const router = useRouter()
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const startingRef = useRef(false)
  const mountedRef = useRef(true)
  const startRequestIdsRef = useRef<Partial<Record<WritingTaskType, string>>>({})
  const [selection, setSelection] = useState<PromptSelection>(() => {
    if (typeof window === 'undefined' || !userId) return DefaultPromptSelection
    try {
      return { ...DefaultPromptSelection, ...JSON.parse(window.sessionStorage.getItem(userScopedStorageKey('ielts-writing-prompt-selection-v1', userId)) || '{}') }
    } catch {
      return DefaultPromptSelection
    }
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [startingMode, setStartingMode] = useState<WritingTaskType | null>(null)
  const [pendingMode, setPendingMode] = useState<WritingTaskType | null>(null)
  const [launchProgress, setLaunchProgress] = useState(0)

  const task1SubtypeOptions = useMemo(() => selectedTask1SubtypeOptions(selection.task1ChartType), [selection.task1ChartType])

  // Safety: reset overlay state on unmount to prevent permanent blocking
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  function updateSelection(patch: Partial<PromptSelection>) {
    setSelection((current) => {
      const next = {
        ...current,
        ...patch,
        task1Subtype: patch.task1ChartType && !(selectedTask1SubtypeOptions(patch.task1ChartType) as readonly string[]).includes(current.task1Subtype) ? 'random' : (patch.task1Subtype ?? current.task1Subtype)
      }
      if (userId) window.sessionStorage.setItem(userScopedStorageKey('ielts-writing-prompt-selection-v1', userId), JSON.stringify(next))
      return next
    })
  }

  function prefetchMode(mode: WritingTaskType) {
    router.prefetch(buildHref(mode, selection))
  }

  async function startMode(mode: WritingTaskType) {
    if (!userId || startingRef.current) return
    startingRef.current = true
    setStartingMode(mode)
    setLaunchProgress(18)
    let navigating = false
    let resolved = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超时
    // Safety: unconditionally reset overlay after 20 seconds
    const safetyTimeoutId = setTimeout(() => {
      if (!resolved && mountedRef.current) {
        startingRef.current = false
        setStartingMode(null)
        setLaunchProgress(0)
      }
    }, 20000)
    try {
      const requestId = startRequestIdsRef.current[mode] || createDraftRequestId()
      startRequestIdsRef.current[mode] = requestId
      const payload = await createManagedDraft(mode, selection, requestId, controller.signal)
      resolved = true
      setLaunchProgress(62)
      delete startRequestIdsRef.current[mode]
      const params = searchParamsForSelection(mode, selection)
      params.set('draft', payload.draft.id)
      setLaunchProgress(90)
      navigating = true
      router.push(`/write/${mode}?${params.toString()}`)
    } catch (error) {
      resolved = true
      clearTimeout(timeoutId)
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      const isTimeout = error instanceof DOMException && error.name === 'AbortError'
      const limitTab = code === 'DRAFT_LIMIT_REACHED_TASK2'
        ? 'task2'
        : code === 'DRAFT_LIMIT_REACHED_FULL_TEST'
          ? 'mock'
          : code === 'DRAFT_LIMIT_REACHED_TASK1'
            ? 'task1'
            : null
      if (limitTab) {
        router.push(`/practice?drafts=1&draftTab=${limitTab}`)
      }
      pushToast({
        kind: 'error',
        title: isTimeout ? '创建草稿超时' : '暂时无法创建草稿',
        message: isTimeout ? '网络请求超时，请检查网络后重试。' : DraftErrorMessages[code] || (error instanceof Error ? error.message : '请稍后重试。')
      })
    } finally {
      clearTimeout(timeoutId)
      clearTimeout(safetyTimeoutId)
      if (!navigating && mountedRef.current) {
        startingRef.current = false
        setStartingMode(null)
        setLaunchProgress(0)
      }
    }
  }

  return (
    <>
      <div className="mode-grid">
        {modes.map((mode) => (
          <button
            key={mode.mode}
            className="mode-card-trigger"
            type="button"
            aria-label={`开始 ${mode.title}`}
            disabled={startingMode !== null}
            aria-busy={startingMode === mode.mode || undefined}
            onClick={() => void startMode(mode.mode)}
            onPointerEnter={() => prefetchMode(mode.mode)}
            onFocus={() => prefetchMode(mode.mode)}
          >
            <GlassPanel className={`mode-card ui-hover-glow ui-clickable-card ${mode.featured ? 'is-featured' : ''} ${mode.recommended ? 'is-recommended' : ''}`}>
              <header>
                <span className="mode-icon">
                  <MaterialIcon name={mode.icon} filled={mode.featured} size={28} />
                </span>
                {mode.minutes ? (
                  <span className="mode-badge">
                    <MaterialIcon name="schedule" size={16} />
                    <span className="ui-label">{mode.minutes}</span>
                  </span>
                ) : null}
              </header>
              <h2>{mode.title}</h2>
              <p className="mode-subtitle">
                {mode.subtitle.includes('+') ? (
                  <>
                    Task 1 <MaterialIcon name="add" size={14} /> Task 2
                  </>
                ) : (
                  mode.subtitle
                )}
              </p>
              <div className="mode-card-footer">
                <span className="mode-meta">
                  <MaterialIcon name="description" size={18} />
                  {mode.words}
                </span>
                <span className={mode.featured ? 'ui-dark-button' : mode.primary ? 'ui-primary-button' : 'ui-secondary-button'}>
                  {startingMode === mode.mode ? '正在创建…' : mode.action}
                </span>
              </div>
            </GlassPanel>
          </button>
        ))}
      </div>

      <button className="draft-entry-button" type="button" onClick={() => router.push('/ielts/past-papers')}>
        <span className="draft-entry-icon">
          <MaterialIcon name="auto_stories" size={22} />
        </span>
        <span>
          <strong>真题题库</strong>
          <small>浏览高频、次高频及不同题型的雅思写作真题</small>
        </span>
        <MaterialIcon name="arrow_forward" size={18} />
      </button>

      <DraftManager initialOpen={initialDraftsOpen} initialTab={initialDraftTab} />

      <GlassPanel level={2} className="prompt-choice-panel">
        <div className="settings-section-header">
          <div>
            <h2 className="ui-title-md">练习设置</h2>
            <p className="ui-body-md">可选配置；直接点击上方卡片时，未选择的项目会自动随机。</p>
          </div>
          <div className="prompt-choice-actions">
            <button className="ui-secondary-button" type="button" onClick={() => setShowAdvanced((value) => !value)}>
              <MaterialIcon name={showAdvanced ? 'expand_less' : 'tune'} size={18} />
              {showAdvanced ? '收起高级' : '高级选项'}
            </button>
            <button className="ui-secondary-button" type="button" onClick={() => updateSelection(DefaultPromptSelection)}>
              <MaterialIcon name="casino" size={18} />
              全部随机
            </button>
          </div>
        </div>

        <div className="prompt-choice-list">
          <PracticeSettingRow title="练习模式" description="选择单项练习或完整 60 分钟模考。">
            <div className="choice-chip-row">
              {modes.map((mode) => (
                <button
                  key={mode.mode}
                  className="choice-chip choice-link"
                  type="button"
                  disabled={startingMode !== null}
                  onClick={() => setPendingMode(mode.mode)}
                  onPointerEnter={() => prefetchMode(mode.mode)}
                  onFocus={() => prefetchMode(mode.mode)}
                >
                  {startingMode === mode.mode ? '正在创建…' : mode.title}
                </button>
              ))}
            </div>
          </PracticeSettingRow>

          <PracticeSettingRow title="Task 1 题型" description="指定图表、地图或流程题；未选择时将随机生成。">
            <div className="practice-setting-control-stack">
              <div className="choice-chip-row">
                {[...primaryTask1Types, ...(showAdvanced ? advancedTask1Types : [])].map((type) => (
                  <Chip
                    key={type}
                    selected={selection.task1ChartType === type}
                    label={compactLabel(type, Task1ChartLabels[type])}
                    title={type === 'mixed_charts' ? '组合图表会同时包含两种或多种数据呈现方式。' : undefined}
                    onClick={() => updateSelection({ task1ChartType: selection.task1ChartType === type ? 'random' : type })}
                  />
                ))}
              </div>
              {task1SubtypeOptions.length > 1 ? (
                <div className="choice-chip-row is-subtype">
                  {task1SubtypeOptions.map((type) => (
                    <Chip
                      key={type}
                      selected={selection.task1Subtype === type}
                      label={compactLabel(type, Task1SubtypeLabels[type])}
                      onClick={() => updateSelection({ task1Subtype: selection.task1Subtype === type ? 'random' : type })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </PracticeSettingRow>

          <PracticeSettingRow title="Task 2 题型" description="选择议论文问题结构，保留所有子问题要求。">
            <div className="choice-chip-row">
              {[...primaryTask2Types, ...(showAdvanced ? advancedTask2Types : [])].map((type) => (
                <Chip
                  key={type}
                  selected={selection.task2EssayType === type}
                  label={compactLabel(type, Task2EssayLabels[type])}
                  onClick={() => updateSelection({ task2EssayType: selection.task2EssayType === type ? 'random' : type })}
                />
              ))}
            </div>
          </PracticeSettingRow>

          <PracticeSettingRow title="Task 2 主题" description="选择练习主题；高级选项包含更多常见考试领域。">
            <div className="choice-chip-row">
              {[...primaryTopics, ...(showAdvanced ? advancedTopics : [])].map((topic) => (
                <Chip
                  key={topic}
                  selected={selection.task2Topic === topic}
                  label={compactLabel(topic, Task2TopicLabels[topic])}
                  onClick={() => updateSelection({ task2Topic: selection.task2Topic === topic ? 'random' : topic })}
                />
              ))}
            </div>
          </PracticeSettingRow>
        </div>

        <UploadedTaskPanel />
      </GlassPanel>

      <CenteredDialog
        open={pendingMode !== null}
        title={`开始${pendingMode === 'mock' ? '完整测试' : pendingMode === 'task1' ? ' Task 1' : ' Task 2'}？`}
        description="确认后将按当前练习设置准备题目。"
        className="practice-start-confirm-dialog"
        onClose={() => setPendingMode(null)}
        footer={(
          <>
            <button className="ui-secondary-button" type="button" onClick={() => setPendingMode(null)}>
              取消
            </button>
            <button
              className="ui-primary-button"
              type="button"
              onClick={() => {
                const mode = pendingMode
                setPendingMode(null)
                if (mode) void startMode(mode)
              }}
            >
              确认开始
            </button>
          </>
        )}
      >
        <div className="practice-start-summary">
          <span>
            <MaterialIcon name="schedule" size={18} />
            {pendingMode === 'mock' ? '60 分钟' : pendingMode === 'task1' ? '20 分钟' : '40 分钟'}
          </span>
          <span>
            <MaterialIcon name="description" size={18} />
            {pendingMode === 'mock' ? 'Task 1 + Task 2' : pendingMode === 'task1' ? Task1ChartLabels[selection.task1ChartType] : Task2EssayLabels[selection.task2EssayType]}
          </span>
        </div>
      </CenteredDialog>

      {startingMode ? (
        <div className="practice-launch-layer" role="status" aria-live="polite" aria-label="正在打开写作练习">
          <section className="practice-launch-card">
            <span className="practice-launch-spinner" aria-hidden="true" />
            <strong>正在打开{startingMode === 'mock' ? '完整测试' : startingMode === 'task1' ? ' Task 1' : ' Task 2'}</strong>
            <p>{launchProgress < 50 ? '正在建立练习…' : launchProgress < 80 ? '正在准备题目与草稿…' : '即将打开写作编辑器…'}</p>
            <div
              className="practice-launch-progress"
              role="progressbar"
              aria-label="练习加载进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={launchProgress}
            >
              <span style={{ width: `${launchProgress}%` }} />
            </div>
            <small>{launchProgress}%</small>
            <button
              className="ui-secondary-button"
              type="button"
              style={{ marginTop: 12, fontSize: 13 }}
              onClick={() => {
                startingRef.current = false
                setStartingMode(null)
                setLaunchProgress(0)
              }}
            >
              取消
            </button>
          </section>
        </div>
      ) : null}
    </>
  )
}
