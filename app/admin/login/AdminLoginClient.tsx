'use client'

import { FormEvent, useState } from 'react'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  UserRoundX
} from 'lucide-react'
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type AdminLoginResponse = {
  success?: boolean
  code?: string
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

export function AdminLoginClient({
  currentEmail = '',
  initialReason
}: {
  currentEmail?: string
  initialReason?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState(
    initialReason === 'not_admin' && !currentEmail
      ? '当前会话已退出，请使用管理员账号登录。'
      : ''
  )
  const [activeEmail, setActiveEmail] = useState(currentEmail)
  const isNotAdmin = Boolean(activeEmail)

  async function switchAccount() {
    if (switching) return
    setSwitching(true)
    setError('')

    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
      await fetch('/api/admin/logout', { method: 'POST', cache: 'no-store' }).catch(() => null)
      setActiveEmail('')
      setEmail('')
      setPassword('')
      window.location.replace('/admin/login')
    } catch {
      setError('退出当前账号失败，请刷新页面后重试。')
    } finally {
      setSwitching(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    setLoading(true)
    setError('')

    try {
      const { response, data } = await postWithTimeout<AdminLoginResponse>('/api/admin/login', {
        email,
        password
      })

      if (!response.ok || !data.success) {
        setPassword('')
        setError(data.message || '管理员邮箱或密码错误。')
        return
      }

      window.location.replace(data.redirectTo || '/admin')
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === 'AbortError'
          ? '登录请求超时，请检查网络后重试。'
          : '登录失败，请稍后重试。'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
      <section className="auth-panel auth-panel-modern admin-auth-panel">
        <AuthBrandHeader subtitle="管理后台" />

        <header className="auth-copy">
          <p className="auth-kicker">Admin</p>
          <h1>管理员登录</h1>
          <p>请使用管理员账号登录。</p>
        </header>

        {isNotAdmin ? (
          <section className="admin-account-warning" aria-live="polite">
            <UserRoundX size={22} aria-hidden="true" />
            <div>
              <strong>当前登录的是普通用户账号</strong>
              <p>当前账号：{activeEmail}</p>
              <p>当前登录账号不是管理员账号。管理后台仅允许管理员访问。请退出当前账号后，使用管理员账号登录。</p>
            </div>
          </section>
        ) : (
          <>
            <p className="admin-current-account">
              <span>当前账号</span>
              <strong>未登录</strong>
            </p>

            <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
              <label>
                <span>管理员邮箱</span>
                <div className="auth-input-shell">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="admin@example.com"
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
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="输入管理员密码"
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

              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <button className="ui-primary-button auth-submit auth-main-button" type="submit" disabled={loading}>
                {loading ? <Loader2 className="admin-spin" size={18} /> : <LogIn size={18} />}
                {loading ? '正在验证管理员身份' : '登录管理后台'}
              </button>
            </form>
          </>
        )}

        {isNotAdmin && error ? <p className="auth-error" role="alert">{error}</p> : null}

        <div className="admin-login-actions">
          {isNotAdmin ? (
            <button className="ui-primary-button" type="button" onClick={switchAccount} disabled={switching}>
              {switching ? <Loader2 className="admin-spin" size={17} /> : <LogOut size={17} />}
              {switching ? '正在退出当前账号' : '退出并切换管理员账号'}
            </button>
          ) : null}
          <a className="ui-secondary-button" href="/">
            <ArrowLeft size={17} />
            返回用户端
          </a>
        </div>
      </section>
    </main>
  )
}
