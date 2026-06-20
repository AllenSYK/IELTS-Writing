'use client'

import { useCallback, useRef, useState } from 'react'
import { WritingEvaluationError, evaluationErrorMessage } from '@/lib/writing-evaluation'

export type SubmitStatus = 'idle' | 'saving' | 'submitting' | 'organizing' | 'success' | 'error'

export const EVALUATION_STAGES = [
  '正在保存作文',
  '正在请求评分',
  '正在解析评分结果',
  '初步评分已完成',
  '正在补充详细批改',
  '详细批改已完成'
] as const

export const AI_EVALUATION_TIMEOUT_MS = 10 * 60 * 1000

export function useEssaySubmission(options: {
  onError: (message: string) => void
  onInfoToast: (title: string, message: string) => void
}) {
  const { onError, onInfoToast } = options
  const abortControllerRef = useRef<AbortController | null>(null)
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [stageIndex, setStageIndex] = useState(0)
  const [evaluationStartTime, setEvaluationStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  const loading = submitStatus !== 'idle' && submitStatus !== 'error' && submitStatus !== 'success'

  const cancelEvaluation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      onInfoToast('正在取消', '正在取消批改，请稍候。')
    }
  }, [onInfoToast])

  const runSubmission = useCallback(async (execute: (signal: AbortSignal, setStage: (index: number) => void) => Promise<void>) => {
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    let succeeded = false
    setSubmitStatus('saving')
    setStageIndex(0)
    setEvaluationStartTime(Date.now())
    setElapsedTime(0)

    try {
      await execute(abortController.signal, setStageIndex)
      succeeded = true
    } catch (caught) {
      const presentation = evaluationErrorMessage(caught)
      if (caught instanceof WritingEvaluationError && caught.kind === 'cancelled') {
        onInfoToast(presentation.title, presentation.message)
      } else {
        onError(presentation.message)
        setSubmitStatus('error')
      }
    } finally {
      abortControllerRef.current = null
      setEvaluationStartTime(null)
      if (!succeeded) {
        window.setTimeout(() => setSubmitStatus((current) => (current === 'success' ? current : 'idle')), 800)
      }
    }
  }, [onError, onInfoToast])

  return {
    submitStatus,
    setSubmitStatus,
    stageIndex,
    setStageIndex,
    evaluationStartTime,
    elapsedTime,
    loading,
    cancelEvaluation,
    runSubmission,
    abortControllerRef
  }
}
