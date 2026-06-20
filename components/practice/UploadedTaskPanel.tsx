'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { MaterialIcon } from '@/components/app-ui'
import {
  UploadedTask2QuestionTypeSchema,
  validateImageUpload,
  type UploadedTask2Result,
  type UploadedWritingTaskResult,
  type UploadedWritingTaskType
} from '@/lib/uploaded-writing-task'

type UploadStatus =
  | 'idle'
  | 'selected'
  | 'uploading'
  | 'recognizing'
  | 'success'
  | 'confirming'
  | 'error'

type ParseResponse = {
  success?: boolean
  uploadId?: string
  previewUrl?: string
  result?: UploadedWritingTaskResult
  error?: {
    code?: string
    message?: string
    requestId?: string
  }
}

const task2TypeLabels: Record<UploadedTask2Result['detectedQuestionType'], string> = {
  agree_disagree: '同意 / 不同意',
  discuss_both_views: '讨论双方观点',
  advantages_disadvantages: '优点与缺点',
  outweigh: '利是否大于弊',
  causes_solutions: '原因与解决方案',
  problems_solutions: '问题与解决方案',
  positive_negative: '积极或消极发展',
  two_part: '双问题',
  direct_question: '直接问题',
  other: '其他题型'
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return `parse_${crypto.randomUUID().replaceAll('-', '')}`
  return `parse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function UploadedTaskPanel() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionTimerRef = useRef<number | null>(null)
  const [taskType, setTaskType] = useState<UploadedWritingTaskType>('task1')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [uploadId, setUploadId] = useState('')
  const [result, setResult] = useState<UploadedWritingTaskResult | null>(null)
  const [questionText, setQuestionText] = useState('')
  const [detectedQuestionType, setDetectedQuestionType] = useState<UploadedTask2Result['detectedQuestionType']>('other')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => {
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current)
  }, [previewUrl])

  async function validateAndSelect(nextFile: File | null) {
    if (!nextFile) return
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
      setResult(null)
      setUploadId('')
      setQuestionText('')
    } catch (caught) {
      setFile(null)
      setStatus('error')
      setError(caught instanceof Error ? caught.message : '图片无法读取，请更换后重试。')
    }
  }

  async function removeUpload() {
    if (uploadId) {
      await fetch(`/api/user/uploaded-writing-tasks/${encodeURIComponent(uploadId)}`, {
        method: 'DELETE',
        cache: 'no-store'
      }).catch(() => undefined)
    }
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl('')
    setStatus('idle')
    setUploadId('')
    setResult(null)
    setQuestionText('')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function parseImage() {
    if (!file || status === 'uploading' || status === 'recognizing') return
    setError('')
    setStatus('uploading')
    recognitionTimerRef.current = window.setTimeout(() => setStatus('recognizing'), 450)
    const form = new FormData()
    form.set('taskType', taskType)
    form.set('requestId', createRequestId())
    form.set('file', file)

    try {
      const response = await fetch('/api/ai/parse-uploaded-writing-task', {
        method: 'POST',
        body: form,
        cache: 'no-store'
      })
      const data = await response.json().catch(() => ({})) as ParseResponse
      if (!response.ok || !data.success || !data.uploadId || !data.result) {
        throw new Error(data.error?.message || '题目识别失败，请重新上传清晰图片。')
      }
      setUploadId(data.uploadId)
      setResult(data.result)
      setQuestionText(data.result.questionText)
      if (data.result.taskType === 'task2') setDetectedQuestionType(data.result.detectedQuestionType)
      setStatus('success')
    } catch (caught) {
      setStatus('error')
      setError(caught instanceof Error ? caught.message : '题目识别失败，请重新上传清晰图片。')
    } finally {
      if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current)
      recognitionTimerRef.current = null
    }
  }

  async function confirmTask() {
    if (!uploadId || !result || status === 'confirming') return
    setStatus('confirming')
    setError('')
    try {
      const response = await fetch(`/api/user/uploaded-writing-tasks/${encodeURIComponent(uploadId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText,
          ...(result.taskType === 'task2' ? { detectedQuestionType } : {})
        }),
        cache: 'no-store'
      })
      const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string }
      if (!response.ok || !data.success) throw new Error(data.message || '题目确认失败')
      router.push(`/write/${result.taskType}?customTask=${encodeURIComponent(uploadId)}`)
    } catch (caught) {
      setStatus('success')
      setError(caught instanceof Error ? caught.message : '题目确认失败，请重试。')
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

  const busy = status === 'uploading' || status === 'recognizing' || status === 'confirming'
  const uncertainties = result?.taskType === 'task1'
    ? result.uncertainties.map((item) => `${item.field}：${item.message}`)
    : result?.uncertainties ?? []

  return (
    <section className="custom-task-panel" aria-labelledby="custom-task-title">
      <div className="custom-task-heading">
        <div>
          <p className="ui-label">自定义练习</p>
          <h3 id="custom-task-title">上传自己的题目</h3>
          <p>上传 IELTS 写作题目图片，系统识别内容后由你确认，再进入现有答题和批改流程。</p>
        </div>
        <div className="custom-task-type" role="group" aria-label="选择上传题目的 Task 类型">
          {(['task1', 'task2'] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={taskType === type ? 'is-active' : ''}
              aria-pressed={taskType === type}
              disabled={busy || Boolean(result)}
              onClick={() => setTaskType(type)}
            >
              {type === 'task1' ? 'Task 1' : 'Task 2'}
            </button>
          ))}
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
          <span>支持 PNG、JPG/JPEG、WebP；单张最大 10 MB。手机端可拍照或从相册选择。</span>
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
                <small>{formatBytes(file.size)} · {taskType === 'task1' ? 'IELTS Task 1' : 'IELTS Task 2'}</small>
              </div>
              <button type="button" onClick={() => void removeUpload()} disabled={busy} aria-label="删除或更换图片">
                <MaterialIcon name="delete" size={18} />
              </button>
            </div>

            {status === 'selected' || status === 'error' ? (
              <button className="ui-primary-button custom-task-primary" type="button" onClick={() => void parseImage()}>
                <MaterialIcon name="document_scanner" size={18} />
                上传并识别
              </button>
            ) : null}

            {status === 'uploading' || status === 'recognizing' ? (
              <div className="custom-task-progress" role="status" aria-live="polite">
                <span className="custom-task-spinner" />
                <div>
                  <strong>{status === 'uploading' ? '正在安全上传' : '正在识别题目'}</strong>
                  <span>{status === 'uploading' ? '正在校验文件与图片尺寸…' : '正在提取题目文字和图表结构，请稍候…'}</span>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="custom-task-result">
                <div className="custom-task-result-heading">
                  <span><MaterialIcon name="check_circle" filled size={20} />识别完成，请确认</span>
                  <button type="button" onClick={() => void removeUpload()} disabled={busy}>重新上传</button>
                </div>

                {result.taskTypeConflict ? (
                  <p className="custom-task-warning" role="alert">
                    图片内容可能与所选任务类型不一致，请检查后重试。
                  </p>
                ) : null}

                <label className="custom-task-editor">
                  <span>识别出的题目文字</span>
                  <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} rows={8} />
                </label>

                {result.taskType === 'task2' ? (
                  <label className="custom-task-editor">
                    <span>题型</span>
                    <select
                      value={detectedQuestionType}
                      onChange={(event) => {
                        const parsed = UploadedTask2QuestionTypeSchema.safeParse(event.target.value)
                        if (parsed.success) setDetectedQuestionType(parsed.data)
                      }}
                    >
                      {Object.entries(task2TypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <dl className="custom-task-structure">
                    <div><dt>图表类型</dt><dd>{result.visualType}</dd></div>
                    <div><dt>标题</dt><dd>{result.visualTitle || '未识别'}</dd></div>
                    <div><dt>单位</dt><dd>{result.unit || '未标注'}</dd></div>
                    <div><dt>数据系列</dt><dd>{result.chart?.series.length ?? 0}</dd></div>
                  </dl>
                )}

                {uncertainties.length > 0 ? (
                  <div className="custom-task-uncertainties">
                    <strong>需要你重点核对</strong>
                    <ul>
                      {uncertainties.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}

                <button
                  className="ui-primary-button custom-task-primary"
                  type="button"
                  disabled={busy || questionText.trim().length < 10 || result.taskTypeConflict}
                  onClick={() => void confirmTask()}
                >
                  <MaterialIcon name="edit_note" size={18} />
                  {status === 'confirming' ? '正在创建练习' : '确认题目并开始练习'}
                </button>
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
        图片仅保存到当前账号的私有空间，不会生成公共永久链接；PDF 暂未支持。
      </p>
    </section>
  )
}
