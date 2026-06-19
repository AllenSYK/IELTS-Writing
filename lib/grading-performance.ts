type GradingStageLog = {
  requestId: string
  model: string
  stage: string
  durationMs: number
  attempt: number
  success: boolean
}

export function logGradingStage(entry: GradingStageLog) {
  console.info('[grading-stage]', entry)
}

export async function measureGradingStage<T>({
  requestId,
  model,
  stage,
  attempt = 1,
  run
}: {
  requestId: string
  model: string
  stage: string
  attempt?: number
  run: () => Promise<T>
}) {
  const startedAt = performance.now()
  try {
    const result = await run()
    logGradingStage({
      requestId,
      model,
      stage,
      durationMs: Math.round(performance.now() - startedAt),
      attempt,
      success: true
    })
    return result
  } catch (error) {
    logGradingStage({
      requestId,
      model,
      stage,
      durationMs: Math.round(performance.now() - startedAt),
      attempt,
      success: false
    })
    throw error
  }
}
