'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { getDateKeyInTimeZone } from '@/lib/date-utils'
import type {
  StudyPlan,
  StudyPlanProfile,
  StudyPlanGenerationQuota,
  StudyPlanTask,
  StudyPlanTaskType,
  StudyPlanDiagnosis
} from '@/lib/study-plan-types'
import {
  StudyPlanTaskTypeLabels,
  StudyPlanTaskStatusLabels,
  PlanPhaseLabels,
  ShortCriterionLabels,
  isWritableTaskType
} from '@/lib/study-plan-types'
import { studyPlanWritingHref } from '@/lib/study-plan-writing'
import { styles } from './styles'

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="ui-label" style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
    </div>
  )
}

function OptionGrid({ options, value, onChange }: {
  options: Array<{ value: unknown; label: string; desc?: string }>
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`task-badge ${value === opt.value ? 'is-custom' : ''}`}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{ cursor: 'pointer', padding: '6px 14px' }}
          title={opt.desc}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function CreatePlanWizard({ profile, diagnosis, onGenerate, onClose }: {
  profile: StudyPlanProfile | null
  diagnosis?: StudyPlanDiagnosis
  onGenerate: (data: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    overallTarget: profile?.overallTarget ?? 6.5,
    examDate: profile?.examDate ?? '',
    sessionsPerWeek: profile?.sessionsPerWeek ?? 4,
    minutesPerSession: profile?.minutesPerSession ?? 45,
    intensity: profile?.intensity ?? 'standard' as string,
    allowTimedPractice: profile?.allowTimedPractice ?? true,
    includeFullTests: profile?.includeFullTests ?? true,
    questionBankRatio: profile?.questionBankRatio ?? 80,
    aiGeneratedRatio: profile?.aiGeneratedRatio ?? 20
  })

  const questionSourcePresets = [
    { key: 'all_bank', label: '全部题库', bank: 100, ai: 0 },
    { key: 'bank_first', label: '题库优先', bank: 80, ai: 20 },
    { key: 'balanced', label: '均衡模式', bank: 50, ai: 50 },
    { key: 'ai_first', label: 'AI 个性化优先', bank: 20, ai: 80 },
    { key: 'all_ai', label: '全部 AI', bank: 0, ai: 100 }
  ]

  const activePreset = questionSourcePresets.find((p) => p.bank === form.questionBankRatio && p.ai === form.aiGeneratedRatio)?.key ?? 'custom'

  const handleBankRatioChange = (newBank: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newBank / 5) * 5))
    setForm({ ...form, questionBankRatio: clamped, aiGeneratedRatio: 100 - clamped })
  }

  const handlePreset = (preset: typeof questionSourcePresets[number]) => {
    setForm({ ...form, questionBankRatio: preset.bank, aiGeneratedRatio: preset.ai })
  }

  const [currentTime] = useState(() => Date.now())
  const totalQuestionTasks = useMemo(() => {
    const sessions = form.sessionsPerWeek
    const weeks = form.examDate
      ? Math.max(1, Math.ceil(Math.max(0, (new Date(form.examDate).getTime() - currentTime) / 86400000) / 7))
      : 4
    const totalStudyDays = weeks * sessions
    return Math.max(2, Math.ceil(totalStudyDays * 0.35)) + Math.max(3, Math.ceil(totalStudyDays * 0.45))
  }, [form.sessionsPerWeek, form.examDate, currentTime])

  const bankEstimate = Math.round(totalQuestionTasks * form.questionBankRatio / 100)
  const aiEstimate = totalQuestionTasks - bankEstimate

  return (
    <CenteredDialog
      open
      title="创建学习计划"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" disabled={submitting} onClick={onClose}>取消</button>
          <button className="ui-primary-button" type="button" disabled={submitting} onClick={() => { setSubmitting(true); onGenerate(form) }}>
            {submitting ? '正在启动…' : '后台生成'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {diagnosis?.currentAverage && (
          <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-container-low)', fontSize: 13 }}>
            根据最近作文，当前预测分数为 <strong>{diagnosis.currentAverage.toFixed(1)}</strong>
          </div>
        )}
        <FieldGroup label="目标分数">
          <OptionGrid options={[5.5, 6, 6.5, 7, 7.5, 8].map((v) => ({ value: v, label: String(v) }))} value={form.overallTarget} onChange={(v) => setForm({ ...form, overallTarget: v as number })} />
        </FieldGroup>
        <FieldGroup label="考试日期">
          <input type="date" value={form.examDate} min={getDateKeyInTimeZone()} onChange={(e) => setForm({ ...form, examDate: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 200 }} />
        </FieldGroup>
        <FieldGroup label="每周学习天数">
          <OptionGrid options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} 天` }))} value={form.sessionsPerWeek} onChange={(v) => setForm({ ...form, sessionsPerWeek: v as number })} />
        </FieldGroup>
        <FieldGroup label="每天学习时间">
          <OptionGrid options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} 分钟` }))} value={form.minutesPerSession} onChange={(v) => setForm({ ...form, minutesPerSession: v as number })} />
        </FieldGroup>
        <FieldGroup label="训练强度">
          <OptionGrid options={[
            { value: 'relaxed', label: '轻松', desc: '每天 1 个任务' },
            { value: 'standard', label: '标准', desc: '每天 1–2 个任务' },
            { value: 'intensive', label: '强化', desc: '每天 2–3 个任务' }
          ]} value={form.intensity} onChange={(v) => setForm({ ...form, intensity: v as string })} />
        </FieldGroup>

        <FieldGroup label="题目来源">
          <p className="ui-body-md" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            选择计划中的题目由现有题库抽取，还是由 AI 根据你的薄弱项生成。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {questionSourcePresets.map((preset) => (
              <button
                key={preset.key}
                className={`task-badge ${activePreset === preset.key ? 'is-custom' : ''}`}
                type="button"
                onClick={() => handlePreset(preset)}
                style={{ cursor: 'pointer', padding: '5px 12px', fontSize: 12 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, minWidth: 70, color: 'var(--text-secondary)' }}>题库抽题</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.questionBankRatio}
                onChange={(e) => handleBankRatioChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.questionBankRatio}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, minWidth: 70, color: 'var(--text-secondary)' }}>AI 智能出题</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-container-low)', position: 'relative' }}>
                <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${form.aiGeneratedRatio}%`, borderRadius: 2, background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.aiGeneratedRatio}%</span>
            </div>
          </div>
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-container-low)', fontSize: 12, color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: 2 }}><strong>题库抽题：</strong>从平台现有正式题库中选择，题型和图表数据已经过校验。</p>
            <p><strong>AI 智能出题：</strong>根据你的薄弱项和目标分数生成新题，更个性化但生成时间可能更长。</p>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            预计 {totalQuestionTasks} 个写作任务中：{bankEstimate} 个来自题库，{aiEstimate} 个由 AI 生成。
          </p>
        </FieldGroup>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.allowTimedPractice} onChange={(e) => setForm({ ...form, allowTimedPractice: e.target.checked })} />
            <span className="ui-body-md">接受限时训练</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.includeFullTests} onChange={(e) => setForm({ ...form, includeFullTests: e.target.checked })} />
            <span className="ui-body-md">安排完整模考</span>
          </label>
        </div>
      </div>
    </CenteredDialog>
  )
}

export function ReplanSetupDialog({ profile, diagnosis, planId, onGenerate, onCancel }: {
  profile: StudyPlanProfile | null
  diagnosis?: StudyPlanDiagnosis
  planId?: string
  onGenerate: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    overallTarget: profile?.overallTarget ?? 6.5,
    examDate: profile?.examDate ?? '',
    sessionsPerWeek: profile?.sessionsPerWeek ?? 4,
    minutesPerSession: profile?.minutesPerSession ?? 45,
    intensity: profile?.intensity ?? 'standard' as string,
    allowTimedPractice: profile?.allowTimedPractice ?? true,
    includeFullTests: true,
    questionBankRatio: profile?.questionBankRatio ?? 80,
    aiGeneratedRatio: profile?.aiGeneratedRatio ?? 20
  })

  const questionSourcePresets = [
    { key: 'all_bank', label: '全部题库', bank: 100, ai: 0 },
    { key: 'bank_first', label: '题库优先', bank: 80, ai: 20 },
    { key: 'balanced', label: '均衡模式', bank: 50, ai: 50 },
    { key: 'ai_first', label: 'AI 个性化优先', bank: 20, ai: 80 },
    { key: 'all_ai', label: '全部 AI', bank: 0, ai: 100 }
  ]

  const activePreset = questionSourcePresets.find((p) => p.bank === form.questionBankRatio && p.ai === form.aiGeneratedRatio)?.key ?? 'custom'

  const handleBankRatioChange = (newBank: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newBank / 5) * 5))
    setForm({ ...form, questionBankRatio: clamped, aiGeneratedRatio: 100 - clamped })
  }

  return (
    <CenteredDialog
      open
      title="重新规划学习计划"
      onClose={onCancel}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" disabled={submitting} onClick={onCancel}>取消</button>
          <button className="ui-primary-button" type="button" disabled={submitting} onClick={() => { setSubmitting(true); onGenerate({ ...form, planId }) }}>
            {submitting ? '正在启动…' : '后台重新生成'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {diagnosis?.currentAverage && (
          <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-container-low)', fontSize: 13 }}>
            根据最近作文，当前预测分数为 <strong>{diagnosis.currentAverage.toFixed(1)}</strong>
          </div>
        )}
        <FieldGroup label="目标分数">
          <OptionGrid options={[5.5, 6, 6.5, 7, 7.5, 8].map((v) => ({ value: v, label: String(v) }))} value={form.overallTarget} onChange={(v) => setForm({ ...form, overallTarget: v as number })} />
        </FieldGroup>
        <FieldGroup label="考试日期">
          <input type="date" value={form.examDate} min={getDateKeyInTimeZone()} onChange={(e) => setForm({ ...form, examDate: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 200 }} />
        </FieldGroup>
        <FieldGroup label="每周学习天数">
          <OptionGrid options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} 天` }))} value={form.sessionsPerWeek} onChange={(v) => setForm({ ...form, sessionsPerWeek: v as number })} />
        </FieldGroup>
        <FieldGroup label="每天学习时间">
          <OptionGrid options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} 分钟` }))} value={form.minutesPerSession} onChange={(v) => setForm({ ...form, minutesPerSession: v as number })} />
        </FieldGroup>
        <FieldGroup label="训练强度">
          <OptionGrid options={[
            { value: 'relaxed', label: '轻松' },
            { value: 'standard', label: '标准' },
            { value: 'intensive', label: '强化' }
          ]} value={form.intensity} onChange={(v) => setForm({ ...form, intensity: v as string })} />
        </FieldGroup>

        <FieldGroup label="题目来源比例">
          <p className="ui-body-md" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            修改后，仅未来未开始且未锁定的任务会按新比例重新分配题目。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {questionSourcePresets.map((preset) => (
              <button
                key={preset.key}
                className={`task-badge ${activePreset === preset.key ? 'is-custom' : ''}`}
                type="button"
                onClick={() => setForm({ ...form, questionBankRatio: preset.bank, aiGeneratedRatio: preset.ai })}
                style={{ cursor: 'pointer', padding: '5px 12px', fontSize: 12 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, minWidth: 50, color: 'var(--text-secondary)' }}>题库</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.questionBankRatio}
              onChange={(e) => handleBankRatioChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--primary)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.questionBankRatio}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, minWidth: 50, color: 'var(--text-secondary)' }}>AI</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-container-low)' }}>
              <div style={{ height: '100%', width: `${form.aiGeneratedRatio}%`, borderRadius: 2, background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.aiGeneratedRatio}%</span>
          </div>
        </FieldGroup>
      </div>
    </CenteredDialog>
  )
}

export function SettingsDialog({ profile, onClose, mutate }: {
  profile: StudyPlanProfile
  onClose: () => void
  mutate: () => void
}) {
  const { pushToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    overallTarget: profile.overallTarget,
    examDate: profile.examDate ?? '',
    sessionsPerWeek: profile.sessionsPerWeek,
    minutesPerSession: profile.minutesPerSession,
    intensity: profile.intensity,
    allowTimedPractice: profile.allowTimedPractice,
    includeFullTests: true,
    questionBankRatio: profile.questionBankRatio ?? 80,
    aiGeneratedRatio: profile.aiGeneratedRatio ?? 20
  })

  const questionSourcePresets = [
    { key: 'all_bank', label: '全部题库', bank: 100, ai: 0 },
    { key: 'bank_first', label: '题库优先', bank: 80, ai: 20 },
    { key: 'balanced', label: '均衡模式', bank: 50, ai: 50 },
    { key: 'ai_first', label: 'AI 个性化优先', bank: 20, ai: 80 },
    { key: 'all_ai', label: '全部 AI', bank: 0, ai: 100 }
  ]

  const activePreset = questionSourcePresets.find((p) => p.bank === form.questionBankRatio && p.ai === form.aiGeneratedRatio)?.key ?? 'custom'

  const handleBankRatioChange = (newBank: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newBank / 5) * 5))
    setForm({ ...form, questionBankRatio: clamped, aiGeneratedRatio: 100 - clamped })
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/study-plan/update-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          examDate: form.examDate || null,
          questionBankRatio: form.questionBankRatio,
          aiGeneratedRatio: form.aiGeneratedRatio
        })
      })
      const data = await res.json() as { success?: boolean; message?: string }
      if (!res.ok || !data.success) {
        pushToast({ kind: 'error', title: '保存失败', message: data.message || '请稍后重试' })
        setSaving(false)
        return
      }
      onClose()
      pushToast({ kind: 'success', title: '设置已更新' })
      void mutate()
    } catch {
      pushToast({ kind: 'error', title: '保存失败' })
      setSaving(false)
    }
  }

  return (
    <CenteredDialog
      open
      title="调整学习计划"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="ui-primary-button" type="button" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FieldGroup label="目标分数">
          <OptionGrid options={[5.5, 6, 6.5, 7, 7.5, 8].map((v) => ({ value: v, label: String(v) }))} value={form.overallTarget} onChange={(v) => setForm({ ...form, overallTarget: v as number })} />
        </FieldGroup>
        <FieldGroup label="考试日期">
          <input type="date" value={form.examDate} min={getDateKeyInTimeZone()} onChange={(e) => setForm({ ...form, examDate: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 200 }} />
        </FieldGroup>
        <FieldGroup label="每周学习天数">
          <OptionGrid options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} 天` }))} value={form.sessionsPerWeek} onChange={(v) => setForm({ ...form, sessionsPerWeek: v as number })} />
        </FieldGroup>
        <FieldGroup label="每天学习时间">
          <OptionGrid options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} 分钟` }))} value={form.minutesPerSession} onChange={(v) => setForm({ ...form, minutesPerSession: v as number })} />
        </FieldGroup>
        <FieldGroup label="训练强度">
          <OptionGrid options={[
            { value: 'relaxed', label: '轻松' },
            { value: 'standard', label: '标准' },
            { value: 'intensive', label: '强化' }
          ]} value={form.intensity} onChange={(v) => setForm({ ...form, intensity: v as 'relaxed' | 'standard' | 'intensive' })} />
        </FieldGroup>

        <FieldGroup label="题目来源比例">
          <p className="ui-body-md" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            修改后，仅未来未开始且未锁定的任务会按新比例重新分配题目。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {questionSourcePresets.map((preset) => (
              <button
                key={preset.key}
                className={`task-badge ${activePreset === preset.key ? 'is-custom' : ''}`}
                type="button"
                onClick={() => setForm({ ...form, questionBankRatio: preset.bank, aiGeneratedRatio: preset.ai })}
                style={{ cursor: 'pointer', padding: '5px 12px', fontSize: 12 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, minWidth: 50, color: 'var(--text-secondary)' }}>题库</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.questionBankRatio}
              onChange={(e) => handleBankRatioChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--primary)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.questionBankRatio}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, minWidth: 50, color: 'var(--text-secondary)' }}>AI</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-container-low)' }}>
              <div style={{ height: '100%', width: `${form.aiGeneratedRatio}%`, borderRadius: 2, background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.aiGeneratedRatio}%</span>
          </div>
        </FieldGroup>
      </div>
    </CenteredDialog>
  )
}

export function TaskDetailDialog({ task, onClose, onMutate }: {
  task: StudyPlanTask
  onClose: () => void
  onMutate: () => void
}) {
  const { pushToast } = useToast()
  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const statusLabel = StudyPlanTaskStatusLabels[task.status] ?? task.status
  const title = task.title || typeLabel
  const writable = isWritableTaskType(task.taskType)
  const writingHref = studyPlanWritingHref(task)
  const sourceLabel = task.questionSource === 'ai_generated' ? 'AI 个性化生成' : '平台题库'
  const isAi = task.questionSource === 'ai_generated'
  const missingBankQuestion = writable
    && task.questionSource === 'question_bank'
    && !writingHref
  const missingBankQuestionMessage = task.taskType === 'full_test'
    ? '这个完整测试没有保存成对的 Task 1 和 Task 2 后台题目，请重新生成学习规划后再开始。'
    : '这个题库任务没有绑定后台题目，请重新生成学习规划后再开始。'

  const handleSkip = async () => {
    try {
      await fetch(`/api/study-plan/tasks/${task.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'other' })
      })
      pushToast({ kind: 'info', title: '已跳过' })
      onMutate()
      onClose()
    } catch { /* ignore */ }
  }

  return (
    <CenteredDialog
      open
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {task.status !== 'completed' && (
            <button className="ui-secondary-button" type="button" onClick={handleSkip}>跳过</button>
          )}
          {task.status === 'completed' && task.writingRecordId && (
            <Link className="ui-primary-button" href={`/result?id=${task.writingRecordId}`} prefetch={false}>查看结果</Link>
          )}
          {task.status !== 'completed' && writingHref && (
            <Link className="ui-primary-button" href={writingHref}>开始写作</Link>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="task-badge">{typeLabel}</span>
          <span className="task-badge">{statusLabel}</span>
          <span className="task-badge">{task.estimatedMinutes}分钟</span>
          {task.difficulty && <span className="task-badge">{task.difficulty}</span>}
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 6,
            background: isAi ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--primary-container)',
            color: isAi ? '#fff' : 'var(--on-primary-container)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <MaterialIcon name={isAi ? 'auto_awesome' : 'menu_book'} size={12} />
            {sourceLabel}
          </span>
        </div>
        {task.description && <p className="ui-body-md">{task.description}</p>}
        {missingBankQuestion && (
          <p className="ui-label" role="alert" style={{ color: 'var(--error)' }}>
            {missingBankQuestionMessage}
          </p>
        )}
        {task.generatedReason && (
          <p className="ui-label" style={{ color: 'var(--text-secondary)' }}>原因：{task.generatedReason}</p>
        )}
        {task.focusCriteria.length > 0 && (
          <div>
            <span className="ui-label">重点：</span>
            <span className="ui-body-md">{task.focusCriteria.map((c) => ShortCriterionLabels[c] ?? c).join('、')}</span>
          </div>
        )}
        {isAi && task.fallbackReason && (
          <p className="ui-label" style={{ color: 'var(--text-secondary)' }}>
            备注：AI 生成失败，已自动切换为题库题目
          </p>
        )}
      </div>
    </CenteredDialog>
  )
}

export function ReplanProgressBanner({ job }: { job: { status: string; progress: number; stage?: string | null; message?: string | null; currentStep: string | null } }) {
  return (
    <GlassPanel style={styles.replanBanner}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <MaterialIcon name="autorenew" size={20} />
        <div style={{ flex: 1 }}>
          <h2 className="ui-title-md">正在重新生成学习计划</h2>
          <p className="ui-body-md">{job.message || job.stage || '处理中...'}</p>
        </div>
        <span className="ui-label">{job.progress}%</span>
      </div>
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${job.progress}%` }} />
      </div>
    </GlassPanel>
  )
}

export function GenerationProgressCard({ job }: { job: { status: string; progress: number; stage?: string | null; message?: string | null; currentStep: string | null } }) {
  return (
    <GlassPanel style={styles.progressCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <MaterialIcon name="auto_awesome" size={24} />
        <div style={{ flex: 1 }}>
          <h2 className="ui-title-md">正在生成学习计划</h2>
          <p className="ui-body-md">{job.message || job.stage || '准备中...'}</p>
        </div>
        <span className="ui-label">{job.progress}%</span>
      </div>
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${job.progress}%` }} />
      </div>
    </GlassPanel>
  )
}

export function PlanOverview({ plan, profile, onRefreshAnalysis, isAnalysisRefreshing, analysisRefreshProgress }: {
  plan: StudyPlan
  profile: StudyPlanProfile | null
  onRefreshAnalysis: () => void
  isAnalysisRefreshing: boolean
  analysisRefreshProgress: number
}) {
  const today = getDateKeyInTimeZone()
  const [now] = useState(() => Date.now())
  const examDays = profile?.examDate ? Math.max(0, Math.ceil((new Date(profile.examDate).getTime() - now) / 86400000)) : null
  const tasks = plan.tasks ?? []
  const weekTasks = tasks.filter((t) => {
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndKey = weekEnd.toISOString().slice(0, 10)
    return t.scheduledDate >= today && t.scheduledDate <= weekEndKey && t.status !== 'rescheduled'
  })
  const completedThisWeek = weekTasks.filter((t) => t.status === 'completed').length
  const completionRate = weekTasks.length > 0 ? Math.round((completedThisWeek / weekTasks.length) * 100) : 0
  const phase = plan.currentPhase ? PlanPhaseLabels[plan.currentPhase] ?? plan.currentPhase : null

  const totalDays = plan.periodStart && plan.periodEnd
    ? Math.ceil((new Date(plan.periodEnd).getTime() - new Date(plan.periodStart).getTime()) / 86400000)
    : null
  const totalWeeks = totalDays ? Math.ceil(totalDays / 7) : null

  const snapshot = profile?.analysisSnapshot as Record<string, unknown> | undefined
  const snapshotCounts = snapshot?.counts as Record<string, number> | undefined
  const snapshotScores = snapshot?.scores as Record<string, number | null> | undefined
  const snapshotDiag = snapshot?.diagnosis as Record<string, unknown> | undefined
  const analysisUpdatedAt = profile?.analysisUpdatedAt as string | null | undefined
  const sourceRecordCount = profile?.analysisSourceRecordCount ?? 0

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return `今天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <GlassPanel style={styles.overviewCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          {sourceRecordCount > 0 && (
            <p className="ui-label" style={{ color: 'var(--text-secondary)' }}>
              基于 {sourceRecordCount} 篇已批改作文
              {analysisUpdatedAt && ` · 上次更新：${formatTime(analysisUpdatedAt)}`}
            </p>
          )}
        </div>
        <button
          className="ui-secondary-button"
          type="button"
          onClick={onRefreshAnalysis}
          disabled={isAnalysisRefreshing}
          style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <MaterialIcon name={isAnalysisRefreshing ? 'sync' : 'refresh'} size={16} />
          {isAnalysisRefreshing ? `正在更新 ${analysisRefreshProgress}%` : '刷新学习数据'}
        </button>
      </div>

      <div style={styles.overviewGrid}>
        {snapshotCounts && (
          <>
            <OverviewItem icon="edit_note" label="已完成" value={`${snapshotCounts.total ?? 0} 篇`} />
            <OverviewItem icon="bar_chart" label="Task 1" value={`${snapshotCounts.task1 ?? 0} 篇`} />
            <OverviewItem icon="article" label="Task 2" value={`${snapshotCounts.task2 ?? 0} 篇`} />
            <OverviewItem icon="quiz" label="完整模考" value={`${snapshotCounts.fullTests ?? 0} 次`} />
          </>
        )}
        <OverviewItem icon="flag" label="目标分数" value={String(plan.goalsSnapshot?.overallTarget ?? '—')} />
        <OverviewItem icon="trending_up" label="当前预测" value={snapshotScores?.overall?.toFixed(1) ?? plan.diagnosis?.currentAverage?.toFixed(1) ?? '—'} />
        <OverviewItem icon="event" label="考试日期" value={profile?.examDate ? new Date(profile.examDate).toLocaleDateString('zh-CN') : '未设置'} />
        <OverviewItem icon="schedule" label="剩余天数" value={examDays !== null ? `${examDays} 天` : '—'} />
        {totalWeeks && <OverviewItem icon="date_range" label="计划周期" value={`${totalWeeks} 周`} />}
        {phase && <OverviewItem icon="route" label="当前阶段" value={phase} />}
        <OverviewItem icon="check_circle" label="本周完成" value={`${completedThisWeek}/${weekTasks.length} (${completionRate}%)`} />
        {(() => {
          const weakArr = snapshotDiag?.weakestCriteria
          if (Array.isArray(weakArr) && weakArr.length > 0) {
            const key = String(weakArr[0])
            return <OverviewItem icon="priority_high" label="最弱项" value={ShortCriterionLabels[key] ?? key} />
          }
          return null
        })()}
      </div>
    </GlassPanel>
  )
}

function OverviewItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={styles.overviewItem}>
      <MaterialIcon name={icon} size={18} />
      <span className="ui-label">{label}</span>
      <strong style={{ fontSize: 16 }}>{value}</strong>
    </div>
  )
}

export function TodayTasks({ tasks, onSelectTask }: { tasks: StudyPlanTask[]; onSelectTask: (t: StudyPlanTask) => void }) {
  if (tasks.length === 0) return null

  return (
    <GlassPanel style={styles.todayCard}>
      <h2 className="ui-title-md" style={{ marginBottom: 12 }}>今日任务</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map((task) => {
          const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
          const title = task.title || typeLabel
          const isCompleted = task.status === 'completed'
          return (
            <div
              key={task.id}
              style={{ ...styles.todayTaskRow, cursor: 'pointer', opacity: isCompleted ? 0.6 : 1 }}
              onClick={() => onSelectTask(task)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelectTask(task) }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <MaterialIcon name={isCompleted ? 'check_circle' : 'radio_button_unchecked'} size={18} />
                <span style={{ fontSize: 14, textDecoration: isCompleted ? 'line-through' : undefined }}>{title}</span>
              </div>
              <span className="ui-label">{task.estimatedMinutes}分钟</span>
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

export function BottomActions({ quota, onReplan, onSettings }: {
  quota?: StudyPlanGenerationQuota
  onReplan: () => void
  onSettings: () => void
}) {
  return (
    <div style={styles.bottomActions}>
      <button className="ui-secondary-button" type="button" onClick={onSettings}>
        <MaterialIcon name="settings" size={16} />
        调整计划
      </button>
      <button className="ui-secondary-button" type="button" onClick={onReplan}>
        <MaterialIcon name="autorenew" size={16} />
        重新规划
      </button>
      {quota && (
        <span className="ui-label">本月已调整 {quota.usedCount}/{quota.limit} 次</span>
      )}
    </div>
  )
}
