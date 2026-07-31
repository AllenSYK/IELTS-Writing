'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { AnnotatedEssay } from '@/components/evaluation/AnnotatedEssay'
import { AnnotationDialog } from '@/components/evaluation/AnnotationDialog'
import { EvaluationLayout } from '@/components/evaluation/EvaluationLayout'
import { ScoreSummary } from '@/components/evaluation/ScoreSummary'
import { ConfirmDialog, useToast } from '@/components/interaction-system'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { Task1Visual } from '@/components/task1/Task1Visual'
import {
  annotationsOverlap,
  applyAcceptedAnnotationChanges,
  isResolvedAnnotation,
  selectCompatibleAnnotations
} from '@/lib/essay-annotations'
import { criterionKeysForTask } from '@/lib/ielts-scoring'
import { getQuestionById } from '@/lib/ielts-questions'
import type { Task1ChartSpec, Task1ProcessSpec, Task1MapSpec } from '@/lib/task1-chart-schema'
import {
  EssayAnnotationLabels,
  TaskTypeLabels,
  formatBand,
  formatDate,
  getWritingRecordFromServer,
  saveMistakeRecord,
  saveWritingRecord,
  type AcceptedAnnotationChange,
  type CriterionKey,
  type EssayAnnotation,
  type EssayAnnotationCategory,
  type WritingRecord
} from '@/lib/writing-records'
import { userScopedStorageKey } from '@/lib/user-storage'

type ResultTab = 'original' | 'corrected' | 'revised' | 'model'
type RevisedSubTab = 'annotation' | 'ai'
type AnnotationFilter = 'all' | 'grammar' | 'vocabulary' | 'logic' | 'task' | 'high'

function isGrammarCategory(category: EssayAnnotationCategory) {
  return category === 'grammar' || category === 'spelling' || category === 'punctuation' || category === 'sentence-structure'
}

function isVocabularyCategory(category: EssayAnnotationCategory) {
  return category === 'vocabulary' || category === 'collocation' || category === 'style' || category === 'repetition'
}

function isLogicCategory(category: EssayAnnotationCategory) {
  return category === 'coherence' || category === 'cohesion' || category === 'unclear-expression'
}

function annotationMatchesFilter(annotation: EssayAnnotation, filter: AnnotationFilter) {
  if (filter === 'all') return true
  if (filter === 'grammar') return isGrammarCategory(annotation.category)
  if (filter === 'vocabulary') return isVocabularyCategory(annotation.category)
  if (filter === 'logic') return isLogicCategory(annotation.category)
  if (filter === 'task') return annotation.category === 'task-response'
  return annotation.severity === 'high'
}

function countAnnotations(annotations: EssayAnnotation[]) {
  return {
    all: annotations.length,
    grammar: annotations.filter((annotation) => annotationMatchesFilter(annotation, 'grammar')).length,
    vocabulary: annotations.filter((annotation) => annotationMatchesFilter(annotation, 'vocabulary')).length,
    logic: annotations.filter((annotation) => annotationMatchesFilter(annotation, 'logic')).length,
    task: annotations.filter((annotation) => annotationMatchesFilter(annotation, 'task')).length,
    high: annotations.filter((annotation) => annotationMatchesFilter(annotation, 'high')).length
  }
}

function AnnotationFilterBar({
  value,
  counts,
  onChange
}: {
  value: AnnotationFilter
  counts: Record<AnnotationFilter, number>
  onChange: (value: AnnotationFilter) => void
}) {
  const filters: Array<{ value: AnnotationFilter; label: string; icon: string }> = [
    { value: 'all', label: '全部问题', icon: 'select_all' },
    { value: 'grammar', label: '语法', icon: 'spellcheck' },
    { value: 'vocabulary', label: '词汇', icon: 'menu_book' },
    { value: 'logic', label: '衔接与逻辑', icon: 'schema' },
    { value: 'task', label: '任务回应', icon: 'assignment_turned_in' },
    { value: 'high', label: '高严重程度', icon: 'priority_high' }
  ]
  return (
    <div className="annotation-filter-bar" role="toolbar" aria-label="标注筛选">
      {filters.map((filter) => (
        <button
          key={filter.value}
          className={`annotation-filter ${value === filter.value ? 'is-active' : ''}`}
          type="button"
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
        >
          <MaterialIcon name={filter.icon} size={16} />
          <span>{filter.label}</span>
          <strong>{counts[filter.value]}</strong>
        </button>
      ))}
    </div>
  )
}

function EmptyResult() {
  return (
    <main className="ui-page" tabIndex={-1}>
      <section className="result-main">
        <GlassPanel level={2} className="empty-state">
          <h1 className="ui-title-headline">暂无真实批改结果</h1>
          <p className="ui-body-md">提交作文并完成批改后，这里会展示总分、四项评分、逐句问题和改写建议。</p>
          <a className="ui-primary-button" href="/practice" style={{ marginTop: 24 }}>
            开始写作
          </a>
        </GlassPanel>
      </section>
    </main>
  )
}

function resultCriterionLabel(key: CriterionKey) {
  if (key === 'taskAchievement') return 'Task Achievement'
  if (key === 'taskResponse') return 'Task Response'
  if (key === 'coherenceCohesion') return 'Coherence and Cohesion'
  if (key === 'lexicalResource') return 'Lexical Resource'
  return 'Grammatical Range and Accuracy'
}

export default function ResultPage() {
  const { pushToast } = useToast()
  const { userId } = useUserSession()
  const [record, setRecord] = useState<WritingRecord | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<ResultTab>('corrected')
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>('all')
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [acceptedChanges, setAcceptedChanges] = useState<AcceptedAnnotationChange[]>([])
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(() => new Set())
  const [showAcceptAllConfirm, setShowAcceptAllConfirm] = useState(false)
  const [generatingDerivative, setGeneratingDerivative] = useState<'revised' | 'model' | null>(null)
  const [revisedSubTab, setRevisedSubTab] = useState<RevisedSubTab>('annotation')
  const [mistakeSaved, setMistakeSaved] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [mockAnnotationTask, setMockAnnotationTask] = useState<'task1' | 'task2'>('task2')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    window.queueMicrotask(() => {
      void (async () => {
      const id = new URLSearchParams(window.location.search).get('id')
      const nextRecord = await getWritingRecordFromServer(userId, id)
      if (cancelled) return
      setRecord(nextRecord)
      if (nextRecord) {
        setAcceptedChanges(nextRecord.acceptedChanges ?? [])
        setIgnoredIds(new Set())
        setMistakeSaved(false)
        const storedTab = window.localStorage.getItem(userScopedStorageKey(`ielts-writing-result-tab-${nextRecord.id}`, userId)) as ResultTab | null
        if (storedTab === 'original' || storedTab === 'corrected' || storedTab === 'revised' || storedTab === 'model') {
          setTab(storedTab)
        }
      }
      setLoaded(true)
      })()
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (record && userId) window.localStorage.setItem(userScopedStorageKey(`ielts-writing-result-tab-${record.id}`, userId), tab)
  }, [record, tab, userId])

  if (!loaded) return <PageSkeleton variant="result" />
  if (!record) return <EmptyResult />

  const evaluation = record.evaluation
  const isMock = record.taskType === 'mock'
  const mockActiveComponent = isMock ? record.components?.[mockAnnotationTask] : undefined
  const effectiveEvaluation = isMock && mockActiveComponent?.evaluation ? mockActiveComponent.evaluation : evaluation
  const originalEssay = isMock && mockActiveComponent?.essay ? mockActiveComponent.essay : (record.originalEssay || record.essay)
  const allAnnotations = (isMock ? (effectiveEvaluation.annotations ?? []) : (evaluation.annotations ?? []))
  const unresolvedAnnotations = allAnnotations.filter((annotation) => !isResolvedAnnotation(annotation, originalEssay))
  const acceptedIds = new Set(acceptedChanges.map((change) => change.annotationId))
  const activeAnnotations = allAnnotations.filter((annotation) => !ignoredIds.has(annotation.id) && !acceptedIds.has(annotation.id))
  const annotationCounts = countAnnotations(activeAnnotations)
  const pendingCount = activeAnnotations.filter((a) => a.replacement && isResolvedAnnotation(a, originalEssay)).length
  const visibleAnnotations = activeAnnotations.filter((annotation) => annotationMatchesFilter(annotation, annotationFilter))
  const effectiveSelectedAnnotationId = visibleAnnotations.some((annotation) => annotation.id === selectedAnnotationId)
    ? selectedAnnotationId
    : null
  const selectedAnnotation = effectiveSelectedAnnotationId
    ? visibleAnnotations.find((annotation) => annotation.id === effectiveSelectedAnnotationId) ?? null
    : null
  const modifiedEssay = applyAcceptedAnnotationChanges(originalEssay, acceptedChanges, allAnnotations)
  const correctedEssay = effectiveEvaluation.correctedEssay?.trim()
  const revisedEssay = effectiveEvaluation.improvedEssay?.trim() || effectiveEvaluation.revisedEssay?.trim()
  const modelEssay = effectiveEvaluation.modelEssay?.trim()
  const criteriaSummaries = criterionKeysForTask(record.taskType).map((key) => {
    const criterion = effectiveEvaluation.criteria?.[key]
    return {
      key,
      shortLabel: key === 'taskAchievement' ? 'TA' : key === 'taskResponse' ? 'TR' : key === 'coherenceCohesion' ? 'CC' : key === 'lexicalResource' ? 'LR' : 'GRA',
      label: resultCriterionLabel(key),
      score: criterion?.score ? formatBand(criterion.score) : '—',
      feedback: criterion?.feedback,
      evidence: criterion?.evidence,
      whyNotHigher: criterion?.whyNotHigher
    }
  })

  const bankQuestion = record.taskType === 'task1' && !record.chartSpec && !record.processSpec && !record.mapSpec && !record.imageUrl && record.questionId
    ? getQuestionById(record.questionId)
    : null
  const effectiveChartSpec = (record.chartSpec || bankQuestion?.chartSpec) as Task1ChartSpec | undefined
  const effectiveProcessSpec = (record.processSpec || bankQuestion?.processSpec) as Task1ProcessSpec | undefined
  const effectiveMapSpec = (record.mapSpec || bankQuestion?.mapSpec) as Task1MapSpec | undefined
  const effectiveImageUrl = record.imageUrl || bankQuestion?.image
  const effectiveQuestionType = record.questionType || bankQuestion?.questionType || 'line_chart'
  const hasChartData = record.taskType === 'task1' && (effectiveChartSpec || effectiveProcessSpec || effectiveMapSpec || effectiveImageUrl)

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      pushToast({ kind: 'success', title: `${label}已复制` })
    } catch {
      pushToast({ kind: 'error', title: '复制失败', message: '请手动选中文本复制。' })
    }
  }

  function saveToMistakes() {
    if (!record || !userId || mistakeSaved) return
    const result = saveMistakeRecord(userId, record)
    if (result.alreadyExists) {
      setMistakeSaved(true)
      pushToast({ kind: 'info', title: '已在错题本中', message: '该作文已保存过，无需重复保存。' })
    } else {
      setMistakeSaved(true)
      pushToast({ kind: 'success', title: '已保存到错题本', message: '可在历史记录中继续复盘。' })
    }
  }

  async function handleRewrite() {
    if (!record || !userId || rewriting) return
    setRewriting(true)
    try {
      const res = await fetch(`/api/writing-records/${record.id}/rewrite`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; message?: string; record?: WritingRecord; revisionNumber?: number }
      if (!res.ok || !data.success || !data.record) {
        pushToast({ kind: 'error', title: '创建重写失败', message: data.message || '请稍后重试' })
        return
      }
      pushToast({ kind: 'success', title: `已创建第${data.revisionNumber ?? 2}版` })
      window.location.href = `/write/${record.taskType}?revision=${data.record.id}&original=${record.id}`
    } catch {
      pushToast({ kind: 'error', title: '创建重写失败', message: '请稍后重试' })
    } finally {
      setRewriting(false)
    }
  }

  function persistAcceptedChanges(nextChanges: AcceptedAnnotationChange[]) {
    if (!record || !userId) return
    const updated: WritingRecord = {
      ...record,
      originalEssay,
      acceptedChanges: nextChanges,
      annotationVersion: evaluation.annotationVersion || record.annotationVersion || 1
    }
    setAcceptedChanges(nextChanges)
    setRecord(updated)
    void saveWritingRecord(userId, updated).catch(() => {
      pushToast({ kind: 'error', title: '修改同步失败', message: '本次修改仍保留在当前设备，可稍后重试。' })
    })
  }

  function acceptAnnotation(annotation: EssayAnnotation) {
    if (!annotation.replacement || acceptedIds.has(annotation.id) || !isResolvedAnnotation(annotation, originalEssay)) return
    const acceptedAnnotations = acceptedChanges
      .map((change) => allAnnotations.find((item) => item.id === change.annotationId))
      .filter((item): item is EssayAnnotation => Boolean(item))
    const conflicts = acceptedAnnotations.filter((item) => annotationsOverlap(item, annotation))
    if (conflicts.length > 0 && selectCompatibleAnnotations([...conflicts, annotation]).every((item) => item.id !== annotation.id)) {
      pushToast({ kind: 'info', title: '未接受此修改', message: '它与已接受的更高优先级修改重叠。' })
      return
    }
    const conflictingIds = new Set(conflicts.map((item) => item.id))
    const nextChanges = [
      ...acceptedChanges.filter((change) => change.annotationId !== annotation.id && !conflictingIds.has(change.annotationId)),
      {
        annotationId: annotation.id,
        start: annotation.start,
        end: annotation.end,
        originalText: annotation.originalText,
        replacement: annotation.replacement,
        acceptedAt: new Date().toISOString()
      }
    ]
    persistAcceptedChanges(nextChanges)
    pushToast({
      kind: 'success',
      title: conflicts.length > 0 ? '已替换冲突修改' : '已接受修改'
    })
  }

  function ignoreAnnotation(annotation: EssayAnnotation) {
    setIgnoredIds((current) => {
      const next = new Set(current)
      next.add(annotation.id)
      return next
    })
    pushToast({ kind: 'info', title: '已忽略当前建议' })
  }

  function undoAcceptedChange() {
    if (acceptedChanges.length === 0) return
    persistAcceptedChanges(acceptedChanges.slice(0, -1))
    pushToast({ kind: 'info', title: '已撤销上一次修改' })
  }

  function resetAcceptedChanges() {
    if (acceptedChanges.length === 0) return
    persistAcceptedChanges([])
    pushToast({ kind: 'info', title: '修改后版本已重置' })
  }

  function acceptAllVisibleAnnotations() {
    const existingAnnotations = acceptedChanges
      .map((change) => allAnnotations.find((annotation) => annotation.id === change.annotationId))
      .filter((annotation): annotation is EssayAnnotation => Boolean(annotation))
    const candidates = [
      ...existingAnnotations,
      ...visibleAnnotations.filter((annotation) =>
        Boolean(annotation.replacement) &&
        !ignoredIds.has(annotation.id) &&
        !acceptedIds.has(annotation.id) &&
        isResolvedAnnotation(annotation, originalEssay)
      )
    ]
    const selected = selectCompatibleAnnotations(candidates)
    const existingChanges = new Map(acceptedChanges.map((change) => [change.annotationId, change]))
    const nextChanges = selected.map((annotation) =>
      existingChanges.get(annotation.id) ?? {
        annotationId: annotation.id,
        start: annotation.start,
        end: annotation.end,
        originalText: annotation.originalText,
        replacement: annotation.replacement as string,
        acceptedAt: new Date().toISOString()
      }
    )
    persistAcceptedChanges(nextChanges)
    setShowAcceptAllConfirm(false)
    pushToast({ kind: 'success', title: '已接受当前筛选下的可替换建议' })
  }

  async function generateDerivative(kind: 'revised' | 'model') {
    if (!record || !userId || generatingDerivative) return
    setGeneratingDerivative(kind)
    try {
      const response = await fetch('/api/ai/essay-derivative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: record.id, kind })
      })
      const data = await response.json() as {
        success?: boolean
        message?: string
        text?: string
        nextSteps?: string[]
      }
      if (!response.ok || !data.success || !data.text) {
        throw new Error(data.message || '生成失败，请稍后重试。')
      }
      const freshRecord = await getWritingRecordFromServer(userId, record.id)
      if (freshRecord) {
        setRecord(freshRecord)
      } else {
        const updatedEvaluation = {
          ...record.evaluation,
          ...(kind === 'revised'
            ? {
                improvedEssay: data.text,
                revisedEssay: data.text,
                nextSteps: data.nextSteps || [],
                suggestions: data.nextSteps || []
              }
            : { modelEssay: data.text })
        }
        setRecord({ ...record, evaluation: updatedEvaluation })
      }
      pushToast({ kind: 'success', title: kind === 'revised' ? '改写版本已生成' : '高分范文已生成' })
    } catch (error) {
      pushToast({
        kind: 'error',
        title: '生成失败',
        message: error instanceof Error ? error.message : '请稍后重试。'
      })
    } finally {
      setGeneratingDerivative(null)
    }
  }

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="result-main">
        <header className="result-header">
          <div className="result-header-copy">
            <h1 className="ui-title-display">{record.title}</h1>
            <p className="ui-body-md">
              提交于 {formatDate(record.submittedAt)} · {record.wordCount} 词 · {TaskTypeLabels[record.taskType]}
              {Boolean((record as Record<string, unknown>).studyPlanTaskId) && ' • 来源：学习计划'}
            </p>
          </div>
        </header>

        <div className="result-actions-row">
          {Boolean((record as Record<string, unknown>).studyPlanTaskId) && (
            <a className="ui-primary-button" href="/study-plan">
              <MaterialIcon name="school" size={18} />
              返回学习计划
            </a>
          )}
          <a className="ui-secondary-button" href={`/write/${record.taskType}?record=${record.id}`} title="基于原题重写一篇新作文">
            <MaterialIcon name="edit_note" size={18} />
            基于原题重写
          </a>
          <button className="ui-secondary-button" type="button" onClick={handleRewrite} disabled={rewriting} title="保留原稿，基于反馈创建新版本">
            <MaterialIcon name="auto_fix_high" size={18} />
            {rewriting ? '创建中…' : '根据反馈重写'}
          </button>
          <a className="ui-secondary-button" href={`/write/${record.taskType}`}>
            <MaterialIcon name="replay" size={18} />
            重新练习
          </a>
          <button className="ui-secondary-button" type="button" onClick={saveToMistakes} disabled={mistakeSaved}>
            <MaterialIcon name={mistakeSaved ? 'bookmark' : 'bookmark_add'} size={18} />
            {mistakeSaved ? '已保存到错题本' : '保存到错题本'}
          </button>
          <button
            className="ui-secondary-button"
            type="button"
            onClick={() => {
              const isRevisedAnnotation = tab === 'revised' && revisedSubTab === 'annotation'
              const isRevisedAI = tab === 'revised' && revisedSubTab === 'ai'
              const label = tab === 'model' ? '高分范文' : isRevisedAI ? 'AI改写' : isRevisedAnnotation ? '标注修改版' : tab === 'corrected' ? (acceptedChanges.length > 0 ? '修改版' : '批注版') : '原文'
              const text = tab === 'model' ? modelEssay || '' : isRevisedAI ? revisedEssay || '' : isRevisedAnnotation ? modifiedEssay : tab === 'corrected' ? (acceptedChanges.length > 0 ? modifiedEssay : correctedEssay || originalEssay) : originalEssay
              if (!text) return
              copyText(label, text)
            }}
            disabled={(() => {
              if (tab === 'model') return !modelEssay
              if (tab === 'revised' && revisedSubTab === 'ai') return !revisedEssay
              if (tab === 'revised' && revisedSubTab === 'annotation') return acceptedChanges.length === 0
              return false
            })()}
          >
            <MaterialIcon name="content_copy" size={18} />
            {tab === 'model' ? '复制高分范文' : tab === 'revised' ? (revisedSubTab === 'ai' ? '复制AI改写' : '复制修改版') : tab === 'corrected' ? (acceptedChanges.length > 0 ? '复制修改版' : '复制批注版') : '复制原文'}
          </button>
        </div>

        <EvaluationLayout
          scoreSummary={
            <ScoreSummary
              record={record}
              evaluation={evaluation}
              criteria={criteriaSummaries}
            />
          }
          essayPanel={
            <GlassPanel level={2} className="result-canvas">
              {hasChartData ? (
                <div className="exam-graph-frame">
                  {effectiveChartSpec || effectiveProcessSpec || effectiveMapSpec ? (
                    <Task1Visual
                      chartType={effectiveQuestionType}
                      chartSpec={effectiveChartSpec}
                      processSpec={effectiveProcessSpec}
                      mapSpec={effectiveMapSpec}
                      title={record.title}
                    />
                  ) : effectiveImageUrl ? (
                    <Image
                      alt={record.title}
                      src={effectiveImageUrl}
                      width={720}
                      height={400}
                      style={{ width: '100%', height: 'auto' }}
                      unoptimized
                    />
                  ) : null}
                </div>
              ) : null}
              <div className="result-tabs" role="tablist" aria-label="作文版本">
                <button className={`result-tab ${tab === 'original' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={tab === 'original'} onClick={() => setTab('original')}>
                  原文
                </button>
                <button className={`result-tab ${tab === 'corrected' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={tab === 'corrected'} onClick={() => setTab('corrected')}>
                  批改标注
                </button>
                <button className={`result-tab ${tab === 'revised' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={tab === 'revised'} onClick={() => setTab('revised')}>
                  改写版本
                </button>
                <button className={`result-tab ${tab === 'model' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={tab === 'model'} onClick={() => setTab('model')}>
                  <MaterialIcon name="auto_awesome" size={16} /> 高分范文
                </button>
              </div>

              <article className={`essay-prose ${tab === 'corrected' ? 'annotation-prose' : ''}`} role="tabpanel">
                {tab === 'original' ? (
                  <div className="original-essay-view">
                    <div className="original-essay-hint">
                      <MaterialIcon name="info" size={16} />
                      <span>切换到「批改标注」Tab 可查看带高亮标注的原文</span>
                    </div>
                    <pre className="original-essay-text">{originalEssay}</pre>
                  </div>
                ) : tab === 'corrected' ? (
                  <div className="annotation-workbench">
                    <AnnotationFilterBar value={annotationFilter} counts={annotationCounts} onChange={setAnnotationFilter} />
                    <div className="annotation-stats" aria-live="polite">
                      <strong>共发现 {allAnnotations.length} 处问题</strong>
                      <span>待处理 {pendingCount} 处</span>
                      {acceptedChanges.length > 0 && <span>已接受 {acceptedChanges.length} 处</span>}
                      {ignoredIds.size > 0 && <span>已忽略 {ignoredIds.size} 处</span>}
                    </div>
                    {evaluation.annotationWarnings?.length ? (
                      <div className="annotation-generating-status" role="alert">
                        <MaterialIcon name="warning" size={18} />
                        <strong>部分批注生成失败；分数和现有反馈仍可查看，可点击“基于原题重写”重新批改。</strong>
                      </div>
                    ) : null}
                    {allAnnotations.length > 0 && visibleAnnotations.length === 0 ? (
                      <div className="annotation-inline-empty">
                        <MaterialIcon name="filter_alt_off" size={18} />
                        当前筛选下没有可见标注。
                      </div>
                    ) : null}
                    <AnnotatedEssay
                      essay={originalEssay}
                      annotations={visibleAnnotations}
                      selectedId={effectiveSelectedAnnotationId}
                      onSelect={setSelectedAnnotationId}
                    />
                    {acceptedChanges.length > 0 ? (
                      <section className="modified-essay-preview" aria-label="修改后版本">
                        <div className="modified-essay-header">
                          <span className="ui-label">修改后版本</span>
                          <span>已接受 {acceptedChanges.length} 处修改</span>
                        </div>
                        <p>{modifiedEssay}</p>
                      </section>
                    ) : null}
                    {unresolvedAnnotations.length > 0 ? (
                      <section className="unresolved-annotations" aria-label="未定位建议">
                        <div className="unresolved-header">
                          <h3 className="ui-title-md">
                            <MaterialIcon name="lightbulb" size={18} />
                            其他建议（{unresolvedAnnotations.length} 条）
                          </h3>
                          <span className="unresolved-hint">以下建议无法在原文中精确定位，仅供参考</span>
                        </div>
                        <ul>
                          {unresolvedAnnotations.map((annotation) => (
                            <li key={annotation.id}>
                              <div className="unresolved-annotation-heading">
                                <span className="annotation-category-chip">{EssayAnnotationLabels[annotation.category]}</span>
                                <strong>{annotation.originalText}</strong>
                              </div>
                              <dl className="unresolved-annotation-details">
                                <div><dt>推荐修改</dt><dd>{annotation.replacement || annotation.suggestion}</dd></div>
                                <div><dt>中文解释</dt><dd>{annotation.explanationZh}</dd></div>
                                <div><dt>分数影响</dt><dd>{annotation.impactOnScore}</dd></div>
                                <div><dt>建议</dt><dd>{annotation.suggestion}</dd></div>
                              </dl>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : tab === 'revised' ? (
                  <div className="revised-tab-content">
                    <div className="revised-sub-tabs" role="tablist" aria-label="改写版本切换">
                      <button
                        className={`result-tab ${revisedSubTab === 'annotation' ? 'is-active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={revisedSubTab === 'annotation'}
                        onClick={() => setRevisedSubTab('annotation')}
                        disabled={acceptedChanges.length === 0}
                      >
                        标注修改版 {acceptedChanges.length > 0 ? `(${acceptedChanges.length})` : ''}
                      </button>
                      <button
                        className={`result-tab ${revisedSubTab === 'ai' ? 'is-active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={revisedSubTab === 'ai'}
                        onClick={() => setRevisedSubTab('ai')}
                      >
                        AI 改写版
                      </button>
                    </div>
                    {revisedSubTab === 'annotation' ? (
                      acceptedChanges.length > 0 ? (
                        <pre className="original-essay-text">{modifiedEssay}</pre>
                      ) : (
                        <div className="derivative-empty-state">
                          <h2>暂无标注修改</h2>
                          <p>在「批改标注」Tab 中接受修改建议后，修改版会在这里显示。</p>
                        </div>
                      )
                    ) : (
                      revisedEssay ? (
                        <pre className="original-essay-text">{revisedEssay}</pre>
                      ) : (
                        <div className="derivative-empty-state">
                          <h2>AI 改写尚未生成</h2>
                          <p>按需生成可以让首次批改更快完成。</p>
                          <button className="ui-primary-button" type="button" disabled={Boolean(generatingDerivative)} onClick={() => generateDerivative('revised')}>
                            <MaterialIcon name="auto_fix_high" size={18} />
                            {generatingDerivative === 'revised' ? '正在生成' : '生成 AI 改写'}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  modelEssay || (
                    <div className="derivative-empty-state">
                      <h2>高分范文尚未生成</h2>
                      <p>需要时再生成，避免拖慢核心评分与批注。</p>
                      <button className="ui-primary-button" type="button" disabled={Boolean(generatingDerivative)} onClick={() => generateDerivative('model')}>
                        <MaterialIcon name="auto_awesome" size={18} />
                        {generatingDerivative === 'model' ? '正在生成' : '生成高分范文'}
                      </button>
                    </div>
                  )
                )}
              </article>
            </GlassPanel>
          }
        />
      </section>

      <AnnotationDialog
        annotation={selectedAnnotation}
        annotations={visibleAnnotations}
        originalEssay={originalEssay}
        acceptedIds={acceptedIds}
        ignoredIds={ignoredIds}
        canUndo={acceptedChanges.length > 0}
        onClose={() => setSelectedAnnotationId(null)}
        onSelect={setSelectedAnnotationId}
        onAccept={acceptAnnotation}
        onIgnore={ignoreAnnotation}
        onUndo={undoAcceptedChange}
        onResetAll={resetAcceptedChanges}
        onAcceptAllRequest={() => setShowAcceptAllConfirm(true)}
      />

      <ConfirmDialog
        open={showAcceptAllConfirm}
        title="接受当前筛选下的所有可替换建议？"
        message="这会生成单独的修改后版本，原始提交快照不会被覆盖。"
        confirmLabel="接受全部"
        cancelLabel="取消"
        onCancel={() => setShowAcceptAllConfirm(false)}
        onConfirm={acceptAllVisibleAnnotations}
      />
    </main>
  )
}
