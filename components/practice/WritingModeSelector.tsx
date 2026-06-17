'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GlassPanel, MaterialIcon } from '@/components/stitch-ui'
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

export function WritingModeSelector({ modes }: { modes: ModeCard[] }) {
  const [selection, setSelection] = useState<PromptSelection>(() => {
    if (typeof window === 'undefined') return DefaultPromptSelection
    try {
      return { ...DefaultPromptSelection, ...JSON.parse(window.sessionStorage.getItem('aerowrite-prompt-selection-v1') || '{}') }
    } catch {
      return DefaultPromptSelection
    }
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const task1SubtypeOptions = useMemo(() => selectedTask1SubtypeOptions(selection.task1ChartType), [selection.task1ChartType])

  function updateSelection(patch: Partial<PromptSelection>) {
    setSelection((current) => {
      const next = {
        ...current,
        ...patch,
        task1Subtype: patch.task1ChartType && !(selectedTask1SubtypeOptions(patch.task1ChartType) as readonly string[]).includes(current.task1Subtype) ? 'random' : (patch.task1Subtype ?? current.task1Subtype)
      }
      window.sessionStorage.setItem('aerowrite-prompt-selection-v1', JSON.stringify(next))
      return next
    })
  }

  return (
    <>
      <div className="mode-grid">
        {modes.map((mode) => (
          <Link key={mode.mode} href={buildHref(mode.mode, selection)} aria-label={`Start ${mode.title}`}>
            <GlassPanel className={`mode-card stitch-hover-glow stitch-clickable-card ${mode.featured ? 'is-featured' : ''} ${mode.recommended ? 'is-recommended' : ''}`}>
              <header>
                <span className="mode-icon">
                  <MaterialIcon name={mode.icon} filled={mode.featured} size={28} />
                </span>
                <span className="mode-badge">
                  <MaterialIcon name="schedule" size={16} />
                  <span className="stitch-label">{mode.minutes}</span>
                </span>
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
                <span className={mode.featured ? 'stitch-dark-button' : mode.primary ? 'stitch-primary-button' : 'stitch-secondary-button'}>
                  {mode.action}
                </span>
              </div>
            </GlassPanel>
          </Link>
        ))}
      </div>

      <GlassPanel level={2} className="prompt-choice-panel">
        <div className="settings-section-header">
          <div>
            <h2 className="stitch-title-md">练习设置</h2>
            <p className="stitch-body-md">可选配置；直接点击上方卡片时，未选择的项目会自动随机。</p>
          </div>
          <div className="prompt-choice-actions">
            <button className="stitch-secondary-button" type="button" onClick={() => setShowAdvanced((value) => !value)}>
              <MaterialIcon name={showAdvanced ? 'expand_less' : 'tune'} size={18} />
              {showAdvanced ? '收起高级' : '高级选项'}
            </button>
            <button className="stitch-secondary-button" type="button" onClick={() => updateSelection(DefaultPromptSelection)}>
              <MaterialIcon name="casino" size={18} />
              全部随机
            </button>
          </div>
        </div>

        <div className="prompt-choice-list">
          <section className="prompt-choice-row" aria-label="练习模式">
            <h3 className="stitch-label">练习模式</h3>
            <div className="choice-chip-row">
              {modes.map((mode) => (
                <Link key={mode.mode} className="choice-chip choice-link" href={buildHref(mode.mode, selection)}>
                  {mode.title}
                </Link>
              ))}
            </div>
          </section>

          <section className="prompt-choice-row" aria-label="Task 1 题型">
            <h3 className="stitch-label">Task 1 题型</h3>
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
          </section>

          <section className="prompt-choice-row" aria-label="Task 2 题型">
            <h3 className="stitch-label">Task 2 题型</h3>
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
          </section>

          <section className="prompt-choice-row" aria-label="Task 2 主题">
            <h3 className="stitch-label">Task 2 主题</h3>
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
          </section>
        </div>
      </GlassPanel>
    </>
  )
}
