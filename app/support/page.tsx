'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { AsyncButton, useToast } from '@/components/interaction-system'
import { FaqDialog } from '@/components/support/FaqDialog'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import {
  SupportFaqs,
  SupportFeedbackCategories,
  normalizeSupportFeedbackCategory,
  type SupportFaq,
  type SupportFeedbackCategory
} from '@/lib/support-feedback'

type DeviceInfo = {
  platform: string
  arch: string
}

type FeedbackResult = {
  feedbackId: string
  displayId: string
  createdAt: string
}

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'qgyxzq@gmail.com'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ieltswriting.online'

export default function SupportPage() {
  const { pushToast } = useToast()
  const feedbackRef = useRef<HTMLFormElement>(null)
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '未标注'
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ platform: '浏览器', arch: '未知' })
  const [issueType, setIssueType] = useState<SupportFeedbackCategory>(SupportFeedbackCategories[2])
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<FeedbackResult | null>(null)
  const [selectedFaq, setSelectedFaq] = useState<SupportFaq | null>(null)

  useEffect(() => {
    window.queueMicrotask(() => {
      setDeviceInfo({
        platform: navigator.platform || '浏览器',
        arch: 'Web'
      })
    })
  }, [])

  const diagnostics = useMemo(
    () => ({
      appVersion: version,
      platform: `${deviceInfo.platform} ${deviceInfo.arch}`,
      osVersion: typeof navigator === 'undefined' ? '未提供' : navigator.userAgent || '未提供',
      recentErrorCode: '无'
    }),
    [deviceInfo.arch, deviceInfo.platform, version]
  )

  const diagnosticsText = useMemo(
    () => [
      `应用版本: ${diagnostics.appVersion}`,
      `系统平台: ${diagnostics.platform}`,
      `系统版本: ${diagnostics.osVersion}`,
      `最近错误码: ${diagnostics.recentErrorCode}`
    ].join('\n'),
    [diagnostics]
  )

  const canSubmit = subject.trim().length >= 2 && description.trim().length >= 10

  function useFaqForFeedback(faq: SupportFaq) {
    setIssueType(faq.category)
    setSubject(faq.title)
    setSelectedFaq(null)
    window.requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      pushToast({ kind: 'success', title: `${label}已复制` })
    } catch {
      pushToast({ kind: 'error', title: '复制失败', message: '请手动选中文本复制。' })
    }
  }

  async function submitFeedback(event: FormEvent) {
    event.preventDefault()
    if (submitting || !canSubmit) return
    setSubmitting(true)
    setSubmitError('')
    setResult(null)
    try {
      const response = await fetch('/api/support/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: normalizeSupportFeedbackCategory(issueType),
          subject,
          message: description,
          contactEmail,
          includeDiagnostics,
          diagnostics
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.error) {
        throw new Error(data.message || (data.error === 'invalid_input' ? '请检查标题、描述和邮箱格式。' : '反馈提交失败，请稍后重试。'))
      }
      setResult(data as FeedbackResult)
      pushToast({ kind: 'success', title: '反馈已提交', message: `反馈编号 ${data.displayId}` })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '反馈提交失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="support-main">
        <header className="page-section-header">
          <div>
            <h1 className="ui-title-headline">支持中心</h1>
            <p className="ui-body-lg">先查看常见问题，或提交反馈让管理员在后台处理。</p>
          </div>
          <a className="ui-primary-button" href={`mailto:${supportEmail}?subject=${encodeURIComponent('Carrie学雅思@空与梦 使用反馈')}`}>
            <MaterialIcon name="mail" size={18} />
            联系开发者
          </a>
        </header>

        <GlassPanel className="settings-section">
          <div className="settings-section-header">
            <h2 className="ui-title-md">常见问题</h2>
          </div>
          <ul className="faq-list">
            {SupportFaqs.map((item) => (
              <li key={item.title}>
                <button type="button" onClick={() => setSelectedFaq(item)}>
                  <MaterialIcon name="help" size={18} />
                  <span>{item.title}</span>
                  <MaterialIcon name="chevron_right" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </GlassPanel>

        <GlassPanel className="settings-section">
          <form ref={feedbackRef} className="feedback-form" onSubmit={submitFeedback}>
            <div className="settings-section-header">
              <h2 className="ui-title-md">提交反馈</h2>
              {result ? <span className="feedback-ticket">反馈编号：{result.displayId}</span> : null}
            </div>
            <div className="profile-form-grid">
              <label className="field">
                <span>问题类型</span>
                <select value={issueType} onChange={(event) => setIssueType(normalizeSupportFeedbackCategory(event.target.value))}>
                  {SupportFeedbackCategories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="field">
                <span>联系邮箱（可选）</span>
                <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="name@example.com" inputMode="email" />
              </label>
              <label className="field profile-field-wide">
                <span>问题标题</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="用一句话说明问题" maxLength={120} />
              </label>
              <label className="field profile-field-wide">
                <span>问题描述</span>
                <textarea value={description} rows={5} onChange={(event) => setDescription(event.target.value)} placeholder="请描述发生了什么、你正在使用哪个页面、是否有错误提示。" />
              </label>
              <label className="preference-option profile-field-wide">
                <input type="checkbox" checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} />
                <span>附带脱敏诊断信息</span>
              </label>
            </div>
            <div className="settings-save-bar">
              <p className={`settings-message ${submitError ? 'is-error' : result ? 'is-success' : ''}`}>
                {submitError || (result ? '反馈已进入后台，管理员可以查看和更新处理状态。' : '诊断信息只包含应用版本、系统平台、系统版本和最近错误码。')}
              </p>
              <AsyncButton
                icon="send"
                type="submit"
                loading={submitting}
                success={Boolean(result)}
                disabled={!canSubmit}
                disabledReason={!canSubmit ? '请补充标题和至少 10 个字的问题描述' : undefined}
              >
                提交反馈
              </AsyncButton>
            </div>
          </form>
        </GlassPanel>

        <div className="support-grid">
          <GlassPanel className="settings-section">
            <div className="settings-section-header">
              <h2 className="ui-title-md">联系开发者</h2>
            </div>
            <dl className="diagnostic-list">
              <div><dt>联系邮箱</dt><dd><a href={`mailto:${supportEmail}`}>{supportEmail}</a></dd></div>
              <div><dt>官方网站</dt><dd><a href={siteUrl}>{siteUrl}</a></dd></div>
            </dl>
          </GlassPanel>

          <GlassPanel className="settings-section">
            <div className="settings-section-header">
              <h2 className="ui-title-md">应用信息</h2>
            </div>
            <dl className="diagnostic-list">
              <div><dt>应用版本</dt><dd>{diagnostics.appVersion}</dd></div>
              <div><dt>系统平台</dt><dd>{diagnostics.platform}</dd></div>
              <div><dt>最近错误码</dt><dd>{diagnostics.recentErrorCode}</dd></div>
            </dl>
            <button className="ui-secondary-button" type="button" onClick={() => copyText('诊断信息', diagnosticsText)}>
              <MaterialIcon name="content_copy" size={18} />
              复制脱敏诊断信息
            </button>
          </GlassPanel>
        </div>
      </section>

      <FaqDialog
        faq={selectedFaq}
        open={Boolean(selectedFaq)}
        onClose={() => setSelectedFaq(null)}
        onUseFeedback={useFaqForFeedback}
      />
    </main>
  )
}
