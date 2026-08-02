import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  apiStatusForAiError,
  AiConfigurationError,
  AiProviderError,
  AiResponseError,
  getEffectiveVisionAiConfig
} from '@/lib/ai-provider'
import { recordAiUsage } from '@/lib/ai-usage'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { parseUploadedWritingTask } from '@/lib/uploaded-writing-task-ai'
import {
  UploadedWritingTaskResultSchema,
  buildUploadedWritingQuestion,
  validateImageUpload,
  type UploadedWritingTaskResult
} from '@/lib/uploaded-writing-task'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export const maxDuration = 300

const UploadBucket = 'writing-task-uploads'
const UploadRequestSchema = z.object({
  requestId: z.string().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/)
})

class UploadedTaskFlowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'UploadedTaskFlowError'
  }
}

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return json({ error: { code, message, requestId } }, { status })
}

function safeFileName(name: string) {
  const normalized = name.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim()
  return normalized.slice(0, 180) || 'uploaded-task'
}

function writingMode(result: Exclude<UploadedWritingTaskResult, { taskType: 'unknown' }>) {
  return result.taskType === 'task2' ? 'task2' as const : 'task1' as const
}

function redirectUrl(uploadId: string, result: Exclude<UploadedWritingTaskResult, { taskType: 'unknown' }>) {
  return `/write/${writingMode(result)}?customTask=${encodeURIComponent(uploadId)}`
}

function successResponse(input: {
  uploadId: string
  result: Exclude<UploadedWritingTaskResult, { taskType: 'unknown' }>
  requestId: string
  cached: boolean
}) {
  return json({
    success: true,
    cached: input.cached,
    taskType: input.result.taskType,
    parseStatus: input.result.parseStatus,
    customTaskId: input.uploadId,
    redirectUrl: redirectUrl(input.uploadId, input.result),
    requestId: input.requestId
  })
}

async function cleanupExpiredUploads(service: ReturnType<typeof createSupabaseServiceRoleClient>, userId: string) {
  const { data } = await service
    .from('writing_task_uploads')
    .select('id, storage_path')
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString())
    .limit(20)
  const paths = (data ?? []).flatMap((row) => row.storage_path ? [row.storage_path] : [])
  if (paths.length > 0) await service.storage.from(UploadBucket).remove(paths)
  if ((data ?? []).length > 0) {
    await service.from('writing_task_uploads').delete().in('id', (data ?? []).map((row) => row.id))
  }
}

function parsedUsableResult(value: unknown) {
  const parsed = UploadedWritingTaskResultSchema.safeParse(value)
  return parsed.success && parsed.data.taskType !== 'unknown' ? parsed.data : null
}

function normalizedParseStatus(result: Exclude<UploadedWritingTaskResult, { taskType: 'unknown' }>) {
  if (result.taskType === 'task2') {
    return result.uncertainties.length > 0 ? 'partial' as const : result.parseStatus
  }
  const hasUnreadableValue = result.visuals.some((visual) => {
    if (visual.kind === 'line' || visual.kind === 'bar') {
      return visual.series.some((series) => series.values.some((value) => value === null))
    }
    if (visual.kind === 'pie') return visual.slices.some((slice) => slice.value === null)
    if (visual.kind === 'table') return visual.rows.some((row) => row.some((cell) => cell === null))
    return false
  })
  return result.uncertainties.length > 0 || hasUnreadableValue ? 'partial' as const : result.parseStatus
}

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  const fallbackRequestId = `parse-${Date.now().toString(36)}`
  if (!check.ok) {
    return errorResponse(
      check.code === 'NOT_AUTHENTICATED' ? 'NOT_AUTHENTICATED' : 'LICENSE_REQUIRED',
      check.message,
      fallbackRequestId,
      check.status
    )
  }

  let uploadId: string | null = null
  let storagePath: string | null = null
  let requestId = fallbackRequestId
  let aiUsageModel: string | null = null
  let aiRequestAttempted = false
  let aiUsageRecorded = false
  const service = createSupabaseServiceRoleClient()

  try {
    const form = await request.formData()
    const parsedMeta = UploadRequestSchema.parse({ requestId: form.get('requestId') })
    requestId = parsedMeta.requestId
    const files = form.getAll('file')
    const file = files[0]
    if (files.length !== 1 || !(file instanceof File)) {
      throw new UploadedTaskFlowError('TASK_IMAGE_PARSE_FAILED', '请选择一张题目图片。', 400)
    }
    await cleanupExpiredUploads(service, check.user.id)

    const { data: existingRequest } = await service
      .from('writing_task_uploads')
      .select('id, status, parse_result, confirmed_question, storage_path')
      .eq('user_id', check.user.id)
      .eq('request_id', requestId)
      .maybeSingle()
    const existingResult = parsedUsableResult(existingRequest?.parse_result)
    if (existingRequest?.id && existingRequest.status === 'confirmed' && existingRequest.confirmed_question && existingResult) {
      return successResponse({
        uploadId: existingRequest.id,
        result: existingResult,
        requestId,
        cached: true
      })
    }
    if (existingRequest?.status === 'processing') {
      throw new UploadedTaskFlowError('TASK_IMAGE_PARSE_FAILED', '该图片正在识别，请稍候。', 409)
    }
    if (existingRequest?.id) {
      if (existingRequest.storage_path) {
        await service.storage.from(UploadBucket).remove([existingRequest.storage_path])
      }
      await service
        .from('writing_task_uploads')
        .delete()
        .eq('id', existingRequest.id)
        .eq('user_id', check.user.id)
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count, error: countError } = await service
      .from('writing_task_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', check.user.id)
      .gte('created_at', tenMinutesAgo)
    if (countError) throw countError
    if ((count ?? 0) >= 5) {
      throw new UploadedTaskFlowError('TASK_IMAGE_PARSE_FAILED', '上传过于频繁，请十分钟后再试。', 429)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspected = validateImageUpload({
      name: file.name,
      reportedMimeType: file.type,
      size: file.size,
      bytes
    })
    const contentHash = createHash('sha256').update(bytes).digest('hex')

    const { data: cached } = await service
      .from('writing_task_uploads')
      .select('id, parse_result, confirmed_question')
      .eq('user_id', check.user.id)
      .eq('content_hash', contentHash)
      .eq('status', 'confirmed')
      .not('storage_path', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const cachedResult = parsedUsableResult(cached?.parse_result)
    if (cached?.id && cached.confirmed_question && cachedResult) {
      return successResponse({
        uploadId: cached.id,
        result: cachedResult,
        requestId,
        cached: true
      })
    }

    uploadId = crypto.randomUUID()
    storagePath = `${check.user.id}/${uploadId}.${inspected.extension}`
    const { error: uploadError } = await service.storage
      .from(UploadBucket)
      .upload(storagePath, bytes, {
        contentType: inspected.mimeType,
        upsert: false,
        cacheControl: 'private, max-age=300'
      })
    if (uploadError) throw uploadError

    const { error: rowError } = await service.from('writing_task_uploads').insert({
      id: uploadId,
      user_id: check.user.id,
      request_id: requestId,
      task_type: 'unknown',
      status: 'processing',
      original_file_name: safeFileName(file.name),
      mime_type: inspected.mimeType,
      file_extension: inspected.extension,
      file_size: file.size,
      pixel_width: inspected.width,
      pixel_height: inspected.height,
      content_hash: contentHash,
      storage_path: storagePath
    })
    if (rowError) throw rowError

    const { data: signed, error: signedError } = await service.storage
      .from(UploadBucket)
      .createSignedUrl(storagePath, 5 * 60)
    if (signedError || !signed?.signedUrl || !signed.signedUrl.startsWith('http')) {
      throw new UploadedTaskFlowError(
        'SIGNED_IMAGE_UNAVAILABLE',
        '题目图片暂时无法提供给识别服务，请重试。',
        502
      )
    }

    const visionConfig = await getEffectiveVisionAiConfig()
    aiUsageModel = visionConfig.model
    aiRequestAttempted = true
    const parsed = await parseUploadedWritingTask({
      signedImageUrl: signed.signedUrl,
      requestId,
      primaryConfig: visionConfig
    })
    aiUsageModel = parsed.model
    await recordAiUsage({
      check,
      action: 'recognize_image',
      inputCharacters: 0,
      result: parsed.result,
      model: parsed.model
    })
    aiUsageRecorded = true

    if (parsed.result.taskType === 'unknown') {
      const unclear = parsed.result.reason !== 'not_ielts_writing_task'
      throw new UploadedTaskFlowError(
        unclear ? 'TASK_IMAGE_TOO_UNCLEAR' : 'TASK_NOT_RECOGNIZED',
        parsed.result.message,
        422
      )
    }

    const finalResult = parsed.result.taskType === 'task2'
      ? {
          ...parsed.result,
          parseStatus: normalizedParseStatus(parsed.result)
        }
      : {
          ...parsed.result,
          parseStatus: normalizedParseStatus(parsed.result),
          sourceImagePath: `/api/user/uploaded-writing-tasks/${uploadId}/image`
        }
    const question = buildUploadedWritingQuestion({ uploadId, result: finalResult })
    const mode = writingMode(finalResult)
    const { error: updateError } = await service
      .from('writing_task_uploads')
      .update({
        status: 'confirmed',
        task_type: mode,
        parse_result: finalResult,
        confirmed_question: question,
        confirmed_at: new Date().toISOString(),
        model: parsed.model,
        error_code: null
      })
      .eq('id', uploadId)
      .eq('user_id', check.user.id)
    if (updateError) {
      throw new UploadedTaskFlowError(
        'CUSTOM_TASK_CREATE_FAILED',
        '题目已识别，但创建写作练习失败，请重试。',
        500
      )
    }

    console.info('[uploaded-task-parse]', {
      requestId,
      model: parsed.model,
      taskType: finalResult.taskType,
      parseStatus: finalResult.parseStatus
    })

    return successResponse({
      uploadId,
      result: finalResult,
      requestId,
      cached: false
    })
  } catch (error) {
    if (aiRequestAttempted && !aiUsageRecorded) {
      await recordAiUsage({
        check,
        action: 'recognize_image',
        inputCharacters: 0,
        result: null,
        error,
        model: aiUsageModel
      })
    }
    const errorCode = error instanceof UploadedTaskFlowError
      ? error.code
      : error instanceof AiProviderError
        ? error.code
        : 'TASK_IMAGE_PARSE_FAILED'
    if (uploadId) {
      await service
        .from('writing_task_uploads')
        .update({
          status: 'failed',
          error_code: errorCode,
          storage_path: null
        })
        .eq('id', uploadId)
        .eq('user_id', check.user.id)
    }
    if (storagePath) await service.storage.from(UploadBucket).remove([storagePath])

    if (error instanceof UploadedTaskFlowError) {
      return errorResponse(error.code, error.message, requestId, error.status)
    }
    if (error instanceof z.ZodError) {
      return errorResponse('TASK_IMAGE_PARSE_FAILED', '上传请求格式不正确。', requestId, 400)
    }
    if (error instanceof AiConfigurationError) {
      return errorResponse('VISION_MODEL_NOT_CONFIGURED', '图片识别服务尚未配置。', requestId, 503)
    }
    if (error instanceof AiResponseError) {
      return errorResponse('MODEL_RESPONSE_INVALID', '图片识别结果格式无效，请直接重试。', requestId, 502)
    }
    if (error instanceof AiProviderError) {
      if (error.code === 'vision_model_image_input_unsupported') {
        return errorResponse(
          'VISION_MODEL_IMAGE_INPUT_UNSUPPORTED',
          '当前配置的图片识别模型暂时无法处理图片。',
          requestId,
          422
        )
      }
      if (error.code === 'ai_quota_exhausted') {
        return errorResponse(
          'VISION_SERVICE_QUOTA_EXHAUSTED',
          '图片识别服务额度暂时不足，请稍后再试。',
          requestId,
          503
        )
      }
      return errorResponse(
        'TASK_IMAGE_PARSE_FAILED',
        '图片识别服务暂时不可用，请稍后直接重试。',
        requestId,
        apiStatusForAiError(error)
      )
    }
    const message = error instanceof Error ? error.message : ''
    if (/图片|PNG|JPG|WebP|MIME|10 MB|像素/.test(message)) {
      return errorResponse('TASK_IMAGE_TOO_UNCLEAR', message, requestId, 400)
    }
    console.error('[uploaded-task-parse-failed]', {
      requestId,
      uploadId,
      error: error instanceof Error ? error.name : 'unknown'
    })
    return errorResponse('TASK_IMAGE_PARSE_FAILED', '题目图片识别失败，请直接重试。', requestId, 500)
  }
}
