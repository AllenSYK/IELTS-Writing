'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogIn } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (loginError) {
        setError(loginError.message.includes('Invalid') ? '邮箱或密码不正确。' : loginError.message)
        return
      }

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch('/api/license/status', { signal: controller.signal, cache: 'no-store' })
        const data = (await response.json().catch(() => ({}))) as {
          active?: boolean
          licenseActive?: boolean
          redirectTo?: string
          profile?: { role?: string | null } | null
        }
        const licenseActive = data.licenseActive ?? data.active
        if (data.profile?.role === 'admin') {
          router.replace('/admin/licenses')
          return
        }
        if (licenseActive) {
          router.replace('/dashboard')
          return
        }
        router.replace('/activate')
      } finally {
        window.clearTimeout(timer)
      }
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError' ? '登录检查超时，请重试。' : '登录失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page" data-main-content tabIndex={-1}>
      <section className="auth-panel">
        <div className="auth-heading">
          <span className="auth-icon"><LogIn size={22} /></span>
          <div>
            <p className="stitch-label">IELTS Writing</p>
            <h1>登录</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="stitch-primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 className="admin-spin" size={18} /> : <LogIn size={18} />}
            登录
          </button>
        </form>

        <p className="auth-switch">
          还没有账号？<Link href="/register">注册</Link>
        </p>
      </section>
    </main>
  )
}
