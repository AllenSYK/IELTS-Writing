'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from 'lucide-react'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { AgreementConsent } from '@/components/auth/AgreementConsent'
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton'
import { CurrentAgreementVersions } from '@/lib/legal-agreements'

type LoginResponse = {
  success?: boolean
  message?: string
  redirectTo?: string
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

export default function LoginPage() {
  const router = useRouter()
  const { refreshUser, status: sessionStatus } = useUserSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [agreementsAccepted, setAgreementsAccepted] = useState(false)

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      router.replace('/dashboard')
    }
  }, [sessionStatus, router])

  if (sessionStatus === 'loading') {
    return (
      <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
        <section className="auth-panel auth-panel-modern">
          <div className="auth-brand-mark" aria-hidden="true">
            <span>W</span>
          </div>
          <header className="auth-copy">
            <p className="auth-kicker">IELTS Writing</p>
            <h1>加载中…</h1>
          </header>
        </section>
      </main>
    )
  }

  if (sessionStatus === 'authenticated') return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    if (!agreementsAccepted) {
      setError('请先阅读并同意《服务条款》和《隐私政策》')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { response, data } = await postWithTimeout<LoginResponse>('/api/auth/login', {
        email,
        password,
        agreementsAccepted,
        agreementVersions: CurrentAgreementVersions
      })

      if (!response.ok || !data.success) {
        setError(data.message || '邮箱或密码错误')
        return
      }

      await refreshUser()
      router.replace(data.redirectTo || '/activate')
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError' ? '请求超时，请检查网络后重试。' : '登录失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
      <section className="auth-panel auth-panel-modern">
        <div className="auth-brand-mark" aria-hidden="true">
          <span>W</span>
        </div>

        <header className="auth-copy">
          <p className="auth-kicker">IELTS Writing</p>
          <h1>欢迎回来</h1>
          <p>登录后将进入对应的账号页面。</p>
        </header>

        <div className="auth-method-tabs auth-method-tabs-single">
          <p className="auth-method-label">邮箱登录</p>
        </div>

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

          <label>
            <span>密码</span>
            <div className="auth-input-shell">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => { setPassword(event.target.value); if (error) setError('') }}
                autoComplete="current-password"
                placeholder="输入密码"
                required
              />
              <button
                className="auth-icon-button"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <div className="auth-row">
            <Link href="/forgot-password">忘记密码</Link>
          </div>

          <AgreementConsent
            checked={agreementsAccepted}
            disabled={loading}
            onChange={setAgreementsAccepted}
          />

          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <AuthSubmitButton
            type="submit"
            loading={loading}
            loadingLabel="正在登录"
            disabled={!agreementsAccepted}
            icon={<LogIn size={18} aria-hidden="true" />}
          >
            登录
          </AuthSubmitButton>
        </form>

        <p className="auth-switch">
          没有账号？<Link href="/register">立即注册</Link>
        </p>
      </section>
    </main>
  )
}
