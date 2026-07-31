'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader'
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton'

export function ResetPasswordClient() {
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = createSupabaseBrowserClient()
    const code = searchParams.get('code')

    async function prepareSession() {
      setChecking(true)
      setError('')

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        }

        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!cancelled) {
          setReady(Boolean(data.session))
          if (!data.session) {
            setError('重置链接已失效，请重新发送密码重置邮件')
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setReady(false)
          setError(toChineseAuthError(caught instanceof Error ? caught.message : null))
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    prepareSession()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || !ready) return

    if (password.length < 8) {
      setError('密码至少需要 8 位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(toChineseAuthError(updateError.message))
        return
      }
      await supabase.auth.signOut()
      setMessage('密码已更新，请使用新密码登录。')
      window.setTimeout(() => window.location.replace('/login'), 1200)
    } catch (caught) {
      setError(toChineseAuthError(caught instanceof Error ? caught.message : null))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="auth-panel auth-panel-modern">
      <AuthBrandHeader />
      <header className="auth-copy">
        <p className="auth-kicker">重置密码</p>
        <h1>设置新密码</h1>
        <p>新密码保存后，当前重置会话会自动退出，请重新登录。</p>
      </header>

      <form className="auth-form auth-form-modern" onSubmit={handleSubmit}>
        <label>
          <span>新密码</span>
          <div className="auth-input-shell">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={checking || !ready}
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

        <label>
          <span>确认新密码</span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            disabled={checking || !ready}
            required
          />
        </label>

        {checking ? <p className="auth-success" role="status"><Loader2 className="admin-spin" size={16} />正在验证重置链接</p> : null}
        {message ? <p className="auth-success" role="status"><CheckCircle2 size={16} />{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        <AuthSubmitButton
          type="submit"
          loading={loading}
          loadingLabel="正在保存"
          disabled={checking || !ready}
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
        >
          保存新密码
        </AuthSubmitButton>
      </form>

      <p className="auth-switch">
        <a href="/forgot-password">重新发送重置邮件</a>
      </p>
    </section>
  )
}
