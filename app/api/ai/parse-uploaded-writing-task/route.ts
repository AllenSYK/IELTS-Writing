import { createHash } from 'node:crypto'
import { z } from 'zod'
import { apiStatusForAiError, AiConfigurationError, AiProviderError } from '@/lib/ai-provider'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { parseUploadedWritingTask } from '@/lib/uploaded-writing-task-ai'
import {
  UploadedWritingTaskResultSchema,
  validateImageUpload,
  type UploadedWritingTaskType
} from '@/lib/uploaded-writing-task'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const UploadBucket = 'writing-task-uploads'
const UploadRequestSchema = z.object({
  taskType: z.enum(['task1', 'task2']),
  requestId: z.string().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/)
})

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return json({ error: { code, message, requestId } }, { status })
}

function safeFileName(name: string) {
  const normalized = name.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim()
  return normalized.slice(0, 180) || 'uploaded-task'
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
  const service = createSupabaseServiceRoleClient()

  try {
    const form = await request.formData()
    const parsedMeta = UploadRequestSchema.parse({
      taskType: form.get('taskType'),
      requestId: form.get('requestId')
    })
    requestId = parsedMeta.requestId
    const taskType = parsedMeta.taskType as UploadedWritingTaskType
    const files = form.getAll('file')
    const file = files[0]
    if (files.length !== 1 || !(file instanceof File)) {
      return errorResponse('INVALID_FILE', '请选择一张题目图片。', requestId, 400)
    }

    await cleanupExpiredUploads(service, check.user.id)

    const { data: existingRequest } = await service
      .from('writing_task_uploads')
      .select('id, status, parse_result, original_file_name, file_size')
      .eq('user_id', check.user.id)
      .eq('request_id', requestId)
      .maybeSingle()
    const existingResult = UploadedWritingTaskResultSchema.safeParse(existingRequest?.parse_result)
    if (existingRequest?.id && existingResult.success) {
      return json({
        success: true,
        cached: true,
        uploadId: existingRequest.id,
        fileName: existingRequest.original_file_name || safeFileName(file.name),
        fileSize: existingRequest.file_size || file.size,
        previewUrl: `/api/user/uploaded-writing-tasks/${existingRequest.id}/image`,
        result: existingResult.data,
        requestId
      })
    }
    if (existingRequest?.status === 'processing') {
      return errorResponse('REQUEST_IN_PROGRESS', '该图片正在识别，请稍候。', requestId, 409)
    }
    if (existingRequest?.id) {
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
      return errorResponse('UPLOAD_RATE_LIMITED', '上传过于频繁，请十分钟后再试。', requestId, 429)
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
      .select('id, parse_result, original_file_name, file_size')
      .eq('user_id', check.user.id)
      .eq('task_type', taskType)
      .eq('content_hash', contentHash)
      .in('status', ['parsed', 'confirmed'])
      .not('storage_path', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const cachedResult = UploadedWritingTaskResultSchema.safeParse(cached?.parse_result)
    if (cached?.id && cachedResult.success) {
      return json({
        success: true,
        cached: true,
        uploadId: cached.id,
        fileName: cached.original_file_name || safeFileName(file.name),
        fileSize: cached.file_size || file.size,
        previewUrl: `/api/user/uploaded-writing-tasks/${cached.id}/image`,
        result: cachedResult.data,
        requestId
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
      task_type: taskType,
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
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Unable to create image reference')

    const parsed = await parseUploadedWritingTask({
      taskType,
      signedImageUrl: signed.signedUrl,
      requestId
    })

    const { error: updateError } = await service
      .from('writing_task_uploads')
      .update({
        status: 'parsed',
        parse_result: parsed.result,
        model: parsed.model,
        error_code: null
      })
      .eq('id', uploadId)
      .eq('user_id', check.user.id)
    if (updateError) throw updateError

    return json({
      success: true,
      cached: false,
      uploadId,
      fileName: safeFileName(file.name),
      fileSize: file.size,
      previewUrl: `/api/user/uploaded-writing-tasks/${uploadId}/image`,
      result: parsed.result,
      requestId
    })
  } catch (error) {
    if (uploadId) {
      await service
        .from('writing_task_uploads')
        .update({
          status: 'failed',
          error_code: error instanceof AiProviderError ? error.code : 'TASK_IMAGE_PARSE_FAILED',
          storage_path: null
        })
        .eq('id', uploadId)
        .eq('user_id', check.user.id)
    }
    if (storagePath) await service.storage.from(UploadBucket).remove([storagePath])

    if (error instanceof z.ZodError) {
      return errorResponse('INVALID_UPLOAD_REQUEST', '上传请求格式不正确。', requestId, 400)
    }
    if (error instanceof AiConfigurationError) {
      return errorResponse('VISION_MODEL_NOT_CONFIGURED', '图片识别服务尚未配置。', requestId, 503)
    }
    if (error instanceof AiProviderError) {
      return errorResponse(
        'TASK_IMAGE_PARSE_FAILED',
        '题目识别失败，请重新上传清晰图片。',
        requestId,
        apiStatusForAiError(error)
      )
    }
    const message = error instanceof Error ? error.message : ''
    if (/图片|PNG|JPG|WebP|MIME|10 MB|像素/.test(message)) {
      return errorResponse('INVALID_IMAGE', message, requestId, 400)
    }
    console.error('[uploaded-task-parse]', {
      requestId,
      uploadId,
      error: error instanceof Error ? error.name : 'unknown'
    })
    return errorResponse('TASK_IMAGE_PARSE_FAILED', '题目识别失败，请重新上传清晰图片。', requestId, 500)
  }
}
