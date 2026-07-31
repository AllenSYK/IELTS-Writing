'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { MaterialIcon } from '@/components/app-ui'
import { validateImageUpload } from '@/lib/uploaded-writing-task'

type UploadStatus = 'idle' | 'selected' | 'processing' | 'error'

type ParseResponse = {
  success?: boolean
  taskType?: 'task1_academic' | 'task1_general_letter' | 'task2'
  parseStatus?: 'complete' | 'partial'
  customTaskId?: string
  redirectUrl?: string
  error?: {
    code?: string
    message?: string
    requestId?: string
  }
}

const progressStages = [
  { title: '正在上传', detail: '正在校验并安全保存题目图片…' },
  { title: '正在识别题目', detail: '正在定位试题区域并自动判断 Task 类型…' },
  { title: '正在复原图表', detail: '正在提取题目文字、图表结构和可读数据…' },
  { title: '正在创建练习', detail: '正在将识别结果保存到你的账号…' },
  { title: '即将进入写作', detail: '练习已创建，正在打开对应写作页面…' }
] as const

const errorMessages: Record<string, string> = {
  VISION_MODEL_NOT_CONFIGURED: '图片识别服务尚未配置，请稍后再试。',
  VISION_MODEL_IMAGE_INPUT_UNSUPPORTED: '当前配置的图片识别模型暂时无法处理图片。',
  SIGNED_IMAGE_UNAVAILABLE: '题目图片暂时无法提供给识别服务，请直接重试。',
  TASK_IMAGE_PARSE_FAILED: '图片识别服务暂时不可用，请稍后直接重试。',
  MODEL_RESPONSE_INVALID: '识别结果格式异常，请直接重新识别。',
  TASK_NOT_RECOGNIZED: '未识别到 IELTS 写作题目，请检查图片后重新上传。',
  TASK_IMAGE_TOO_UNCLEAR: '题目关键信息无法辨认，请换一张更清晰的图片。',
  CUSTOM_TASK_CREATE_FAILED: '题目已识别，但创建写作练习失败，请直接重试。'
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return `parse_${crypto.randomUUID().replaceAll('-', '')}`
  return `parse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function UploadedTaskPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const inFlightRef = useRef(false)
  const progressTimersRef = useRef<number[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progressStage, setProgressStage] = useState(0)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => {
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    progressTimersRef.current.forEach((timer) => window.clearTimeout(timer))
  }, [previewUrl])

  function clearProgressTimers() {
    progressTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    progressTimersRef.current = []
  }

  async function validateAndSelect(nextFile: File | null) {
    if (!nextFile || inFlightRef.current) return
    setError('')
    try {
      const bytes = new Uint8Array(await nextFile.arrayBuffer())
      validateImageUpload({
        name: nextFile.name,
        reportedMimeType: nextFile.type,
        size: nextFile.size,
        bytes
      })
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
      setFile(nextFile)
      setPreviewUrl(URL.createObjectURL(nextFile))
      setStatus('selected')
      setProgressStage(0)
    } catch (caught) {
      setFile(null)
      setStatus('error')
      setError(caught instanceof Error ? caught.message : '图片无法读取，请更换后重试。')
    }
  }

  function removeUpload() {
    if (inFlightRef.current) return
    clearProgressTimers()
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl('')
    setStatus('idle')
    setProgressStage(0)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function parseImage() {
    if (!file || inFlightRef.current) return
    inFlightRef.current = true
    setError('')
    setStatus('processing')
    setProgressStage(0)
    clearProgressTimers()
    progressTimersRef.current = [
      window.setTimeout(() => setProgressStage(1), 650),
      window.setTimeout(() => setProgressStage(2), 2_400)
    ]

    const form = new FormData()
    form.set('requestId', createRequestId())
    form.set('file', file)

    try {
      const response = await fetch('/api/ai/parse-uploaded-writing-task', {
        method: 'POST',
        body: form,
        cache: 'no-store'
      })
      const data = await response.json().catch(() => ({})) as ParseResponse
      if (!response.ok || !data.success || !data.customTaskId || !data.redirectUrl) {
        const fallback = data.error?.code ? errorMessages[data.error.code] : ''
        throw new Error(fallback || data.error?.message || '题目图片识别失败，请直接重试。')
      }

      clearProgressTimers()
      setProgressStage(3)
      await wait(220)
      setProgressStage(4)
      await wait(180)
      window.location.assign(data.redirectUrl)
    } catch (caught) {
      clearProgressTimers()
      setStatus('error')
      setError(caught instanceof Error ? caught.message : '题目图片识别失败，请直接重试。')
    } finally {
      inFlightRef.current = false
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    void validateAndSelect(event.target.files?.[0] ?? null)
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    void validateAndSelect(event.dataTransfer.files?.[0] ?? null)
  }

  const busy = status === 'processing'
  const currentStage = progressStages[progressStage]

  return (
    <section className="custom-task-panel" aria-labelledby="custom-task-title">
      <div className="custom-task-heading">
        <div>
          <p className="ui-label">自定义练习</p>
          <h3 id="custom-task-title">上传自己的题目</h3>
          <p>上传 IELTS 写作题目图片，系统会自动判断 Task 类型、复原可读视觉材料，并直接进入写作。</p>
        </div>
      </div>

      {!file ? (
        <button
          type="button"
          className={`custom-task-dropzone ${dragging ? 'is-dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="custom-task-upload-icon"><MaterialIcon name="add_photo_alternate" size={28} /></span>
          <strong>点击选择或拖拽题目图片</strong>
          <span>支持 PNG、JPG/JPEG、WebP；单张最大 10 MB。图片可包含边框、相册界面、浏览器 UI 或杂乱背景。</span>
        </button>
      ) : (
        <div className="custom-task-workspace">
          <div className="custom-task-preview">
            <Image
              src={previewUrl}
              alt="待识别的 IELTS 写作题目"
              width={720}
              height={480}
              unoptimized
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
          <div className="custom-task-details">
            <div className="custom-task-file">
              <span><MaterialIcon name="image" size={20} /></span>
              <div>
                <strong>{file.name}</strong>
                <small>{formatBytes(file.size)} · 自动判断 Task 1 / Task 2</small>
              </div>
              <button type="button" onClick={removeUpload} disabled={busy} aria-label="删除或更换图片">
                <MaterialIcon name="delete" size={18} />
              </button>
            </div>

            {status === 'selected' || status === 'error' ? (
              <button
                className="ui-primary-button custom-task-primary"
                type="button"
                disabled={busy}
                onClick={() => void parseImage()}
              >
                <MaterialIcon name="document_scanner" size={18} />
                上传并识别
              </button>
            ) : null}

            {busy ? (
              <div className="custom-task-progress" role="status" aria-live="polite">
                <span className="custom-task-spinner" />
                <div>
                  <strong>{currentStage.title}</strong>
                  <span>{currentStage.detail}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={handleFileInput}
      />
      {error ? <p className="custom-task-error" role="alert">{error}</p> : null}
      <p className="custom-task-security">
        <MaterialIcon name="lock" size={15} />
        图片和自定义练习仅绑定当前账号；原图保存在私有空间，用于 Task 1 写作时核对。
      </p>
    </section>
  )
}
