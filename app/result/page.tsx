'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnnotatedEssay } from '@/components/evaluation/AnnotatedEssay'
import { AnnotationInspector } from '@/components/evaluation/AnnotationInspector'
import { EvaluationLayout } from '@/components/evaluation/EvaluationLayout'
import { ScoreSummary } from '@/components/evaluation/ScoreSummary'
import { ConfirmDialog, useToast } from '@/components/interaction-system'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { Task1Visual } from '@/components/task1/Task1Visual'
import { criterionKeysForTask } from '@/lib/ielts-scoring'
import { getQuestionById } from '@/lib/ielts-questions'
import type { Task1ChartSpec, Task1ProcessSpec, Task1MapSpec } from '@/lib/task1-chart-schema'
import {
  EssayAnnotationLabels,
  TaskTypeLabels,
  formatBand,
  formatDate,
  getWritingRecord,
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

function isResolvedAnnotation(annotation: EssayAnnotation, essay: string) {
  return (
    !annotation.unresolved &&
    annotation.start >= 0 &&
    annotation.end > annotation.start &&
    annotation.end <= essay.length &&
    essay.slice(annotation.start, annotation.end) === annotation.originalText
  )
}

const AnnotationSeverityRank = { high: 3, medium: 2, low: 1 } as const

function applyAcceptedChanges(
  originalEssay: string,
  changes: AcceptedAnnotationChange[],
  annotations: EssayAnnotation[]
) {
  const annotationById = new Map(annotations.map((annotation) => [annotation.id, annotation]))
  const selected: AcceptedAnnotationChange[] = []
  const sorted = changes
    .filter((change) => change.start >= 0 && change.end > change.start && originalEssay.slice(change.start, change.end) === change.originalText)
    .slice()
    .sort((a, b) => {
      const firstSeverity = annotationById.get(a.annotationId)?.severity ?? 'medium'
      const secondSeverity = annotationById.get(b.annotationId)?.severity ?? 'medium'
      const severity = AnnotationSeverityRank[secondSeverity] - AnnotationSeverityRank[firstSeverity]
      if (severity !== 0) return severity
      return (b.end - b.start) - (a.end - a.start) || a.start - b.start
    })
  for (const change of sorted) {
    if (!selected.some((current) => current.start < change.end && change.start < current.end)) {
      selected.push(change)
    }
  }
  return selected
    .sort((a, b) => b.start - a.start)
    .reduce((text, change) => `${text.slice(0, change.start)}${change.replacement}${text.slice(change.end)}`, originalEssay)
}

function annotationPriority(a: EssayAnnotation, b: EssayAnnotation) {
  const severity = AnnotationSeverityRank[b.severity] - AnnotationSeverityRank[a.severity]
  if (severity !== 0) return severity
  const length = (b.end - b.start) - (a.end - a.start)
  if (length !== 0) return length
  return a.start - b.start
}

function annotationsOverlap(a: Pick<EssayAnnotation, 'start' | 'end'>, b: Pick<EssayAnnotation, 'start' | 'end'>) {
  return a.start < b.end && b.start < a.end
}

function compatibleAnnotations(annotations: EssayAnnotation[]) {
  const selected: EssayAnnotation[] = []
  for (const annotation of annotations.slice().sort(annotationPriority)) {
    if (!selected.some((current) => annotationsOverlap(current, annotation))) selected.push(annotation)
  }
  return selected
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
          <Link className="ui-primary-button" href="/practice" style={{ marginTop: 24 }}>
            开始写作
          </Link>
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

  useEffect(() => {
    if (!userId) return
    window.queueMicrotask(() => {
      const id = new URLSearchParams(window.location.search).get('id')
      const nextRecord = getWritingRecord(userId, id)
      setRecord(nextRecord)
      if (nextRecord) {
        setAcceptedChanges(nextRecord.acceptedChanges ?? [])
        setIgnoredIds(new Set())
        const storedTab = window.localStorage.getItem(userScopedStorageKey(`ielts-writing-result-tab-${nextRecord.id}`, userId)) as ResultTab | null
        if (storedTab === 'original' || storedTab === 'corrected' || storedTab === 'revised' || storedTab === 'model') {
          setTab(storedTab)
        }
      }
      setLoaded(true)
    })
  }, [userId])

  useEffect(() => {
    if (record && userId) window.localStorage.setItem(userScopedStorageKey(`ielts-writing-result-tab-${record.id}`, userId), tab)
  }, [record, tab, userId])

  const sentenceErrors = useMemo(() => record?.evaluation.sentenceAnnotations ?? record?.evaluation.sentenceErrors ?? [], [record])

  if (!loaded) return <PageSkeleton variant="result" />
  if (!record) return <EmptyResult />

  const evaluation = record.evaluation
  const originalEssay = record.originalEssay || record.essay
  const allAnnotations = evaluation.annotations ?? []
  const resolvedAnnotations = allAnnotations.filter((annotation) => isResolvedAnnotation(annotation, originalEssay))
  const unresolvedAnnotations = allAnnotations.filter((annotation) => !isResolvedAnnotation(annotation, originalEssay))
  const acceptedIds = new Set(acceptedChanges.map((change) => change.annotationId))
  const activeAnnotations = allAnnotations.filter((annotation) => !ignoredIds.has(annotation.id))
  const annotationCounts = countAnnotations(activeAnnotations)
  const visibleAnnotations = activeAnnotations.filter((annotation) => annotationMatchesFilter(annotation, annotationFilter))
  const effectiveSelectedAnnotationId = visibleAnnotations.some((annotation) => annotation.id === selectedAnnotationId)
    ? selectedAnnotationId
    : visibleAnnotations[0]?.id ?? null
  const modifiedEssay = applyAcceptedChanges(originalEssay, acceptedChanges, allAnnotations)
  const criterionOrder = criterionKeysForTask(record.taskType)
  const topIssues =
    evaluation.weaknesses && evaluation.weaknesses.length > 0
      ? evaluation.weaknesses.slice(0, 3)
      : sentenceErrors.length > 0
        ? sentenceErrors.slice(0, 3).map((error) => error.explanation)
        : evaluation.feedback.slice(0, 3)
  const correctedEssay = evaluation.correctedEssay?.trim()
  const revisedEssay = evaluation.improvedEssay?.trim() || evaluation.revisedEssay?.trim()
  const modelEssay = evaluation.modelEssay?.trim()
  const criteriaSummaries = criterionOrder.map((key) => {
    const criterion = evaluation.criteria?.[key]
    return {
      key,
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
    if (!record || !userId) return
    saveMistakeRecord(userId, record)
    pushToast({ kind: 'success', title: '已保存到错题本', message: '可在历史记录中继续复盘。' })
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
    saveWritingRecord(userId, updated)
  }

  function acceptAnnotation(annotation: EssayAnnotation) {
    if (!annotation.replacement || acceptedIds.has(annotation.id) || !isResolvedAnnotation(annotation, originalEssay)) return
    const acceptedAnnotations = acceptedChanges
      .map((change) => allAnnotations.find((item) => item.id === change.annotationId))
      .filter((item): item is EssayAnnotation => Boolean(item))
    const conflicts = acceptedAnnotations.filter((item) => annotationsOverlap(item, annotation))
    if (conflicts.length > 0 && compatibleAnnotations([...conflicts, annotation]).every((item) => item.id !== annotation.id)) {
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
    const selected = compatibleAnnotations(candidates)
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

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="result-main">
        <header className="result-header">
          <div className="result-header-copy">
            <p className="ui-label" style={{ color: 'var(--primary)' }}>
              Assessment Result
            </p>
            <h1 className="ui-title-display">{record.title}</h1>
            <p className="ui-body-md">
              Submitted on {formatDate(record.submittedAt)} • {record.wordCount} Words • {TaskTypeLabels[record.taskType]}
            </p>
          </div>
        </header>

        <div className="result-actions-row">
          <Link className="ui-secondary-button" href={`/write/${record.taskType}?record=${record.id}`} title="基于原题重写一篇新作文">
            <MaterialIcon name="edit_note" size={18} />
            基于原题重写
          </Link>
          <Link className="ui-secondary-button" href={`/write/${record.taskType}`}>
            <MaterialIcon name="replay" size={18} />
            重新练习
          </Link>
          <button className="ui-secondary-button" type="button" onClick={saveToMistakes}>
            <MaterialIcon name="bookmark_add" size={18} />
            保存到错题本
          </button>
          <button
            className="ui-secondary-button"
            type="button"
            onClick={() => copyText('当前内容', tab === 'model' ? modelEssay || '' : tab === 'revised' ? (acceptedChanges.length > 0 ? modifiedEssay : revisedEssay || '') : tab === 'corrected' ? (acceptedChanges.length > 0 ? modifiedEssay : correctedEssay || originalEssay) : originalEssay)}
          >
            <MaterialIcon name="content_copy" size={18} />
            复制内容
          </button>
        </div>

        <EvaluationLayout
          scoreSummary={
            <ScoreSummary
              record={record}
              evaluation={evaluation}
              criteria={criteriaSummaries}
              topIssues={topIssues}
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
                      <span>已定位 {resolvedAnnotations.length} 处</span>
                      <span>未精确定位 {unresolvedAnnotations.length} 处</span>
                    </div>
                    {evaluation.annotationWarnings && evaluation.annotationWarnings.length > 0 ? (
                      <div className="annotation-warning-list" role="status">
                        <strong>部分分析未完成</strong>
                        <ul>
                          {evaluation.annotationWarnings.map((warning, index) => (
                            <li key={`annotation-warning-${index}`}>{warning}</li>
                          ))}
                        </ul>
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
                  acceptedChanges.length > 0 ? modifiedEssay : revisedEssay || '本次未返回修改版作文。您可以接受标注中的修改来生成修改版本。'
                ) : (
                  modelEssay || '本次未返回高分范文，并非每次批改都会生成范文。'
                )}
              </article>
            </GlassPanel>
          }
          inspector={
            <AnnotationInspector
              annotations={visibleAnnotations}
              allAnnotations={allAnnotations}
              originalEssay={originalEssay}
              selectedId={effectiveSelectedAnnotationId}
              emptyMessage={
                allAnnotations.length === 0
                  ? sentenceErrors.length > 0
                    ? '此记录没有逐词标注数据，仍可查看左侧重点问题和旧版逐句建议。'
                    : '未发现可定位的具体语言错误。'
                  : '当前筛选下没有可见标注。'
              }
              acceptedIds={acceptedIds}
              ignoredIds={ignoredIds}
              canUndo={acceptedChanges.length > 0}
              onSelect={setSelectedAnnotationId}
              onAccept={acceptAnnotation}
              onIgnore={ignoreAnnotation}
              onUndo={undoAcceptedChange}
              onResetAll={resetAcceptedChanges}
              onAcceptAllRequest={() => setShowAcceptAllConfirm(true)}
            />
          }
        />
      </section>

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
