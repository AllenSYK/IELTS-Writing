'use client'

import { FormEvent, useState } from 'react'
import { ArrowLeft, Mail, Send } from 'lucide-react'
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader'
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton'

type ForgotResponse = {
  success?: boolean
  message?: string
}

async function postWithTimeout<T>(url: string, payload: unknown, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store'
    })
    const data = (await response.json().catch(() => ({}))) as T
    return { response, data }
  } finally {
    window.clearTimeout(timer)
  }
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    setLoading(true)
    setMessage('')
    setError('')

    try {
      const { response, data } = await postWithTimeout<ForgotResponse>('/api/auth/forgot-password', { email })
      if (!response.ok || !data.success) {
        setError(data.message || '密码重置邮件发送失败，请稍后重试')
        return
      }
      setMessage(data.message || '如果该邮箱已注册，密码重置邮件会发送到此邮箱。')
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError' ? '请求超时，请检查网络后重试。' : '密码重置邮件发送失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
      <section className="auth-panel auth-panel-modern">
        <AuthBrandHeader />
        <header className="auth-copy">
          <p className="auth-kicker">找回密码</p>
          <h1>发送重置邮件</h1>
          <p>我们会发送一封品牌化的密码重置邮件，链接仅用于设置新密码。</p>
        </header>

        <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <div className="auth-input-shell">
              <Mail size={18} aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); if (error) setError('') }}
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
            </div>
          </label>

          {message ? <p className="auth-success" role="status">{message}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <AuthSubmitButton
            type="submit"
            loading={loading}
            loadingLabel="正在发送"
            icon={<Send size={18} aria-hidden="true" />}
          >
            发送重置邮件
          </AuthSubmitButton>
        </form>

        <p className="auth-switch">
          <a href="/login"><ArrowLeft size={15} /> 返回登录</a>
        </p>
      </section>
    </main>
  )
}
