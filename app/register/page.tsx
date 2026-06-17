'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: registerError } = await supabase.auth.signUp({
        email: email.trim(),
        password
      })
      if (registerError) {
        setError(registerError.message.includes('already') ? '这个邮箱已经注册。' : registerError.message)
        return
      }

      setMessage('注册成功。如果项目开启邮箱验证，请先打开邮箱完成验证。')
      window.setTimeout(() => {
        router.replace('/activate')
      }, 900)
    } catch {
      setError('注册失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page" data-main-content tabIndex={-1}>
      <section className="auth-panel">
        <div className="auth-heading">
          <span className="auth-icon"><UserPlus size={22} /></span>
          <div>
            <p className="stitch-label">IELTS Writing</p>
            <h1>注册</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <label>
            <span>确认密码</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          {message ? <p className="auth-success" role="status">{message}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="stitch-primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 className="admin-spin" size={18} /> : <UserPlus size={18} />}
            注册
          </button>
        </form>

        <p className="auth-switch">
          已有账号？<Link href="/login">登录</Link>
        </p>
      </section>
    </main>
  )
}
