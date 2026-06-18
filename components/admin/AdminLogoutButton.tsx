'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function AdminLogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function logout() {
    if (loading) return
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
      await fetch('/api/admin/logout', { method: 'POST', cache: 'no-store' }).catch(() => null)
      router.replace('/admin/login')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button className="admin-logout-button" type="button" onClick={logout} disabled={loading}>
      {loading ? <Loader2 className="admin-spin" size={16} /> : <LogOut size={16} />}
      {loading ? '正在退出' : '退出管理员账号'}
    </button>
  )
}
