'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { clearUserRouteMemoryCaches } from '@/lib/user-route-cache'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { AuthSpinner } from '@/components/auth/AuthSubmitButton'
import { useToast } from '@/components/interaction-system'

export function LogoutButton() {
  const { pushToast } = useToast()
  const { userId, prepareForLogout } = useUserSession()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function logout() {
    if (loading) return
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      if (userId) clearUserRouteMemoryCaches(userId)
      prepareForLogout()
      setConfirmOpen(false)
      window.location.replace('/login')
    } catch (error) {
      pushToast({
        kind: 'error',
        title: '退出登录失败',
        message: error instanceof Error ? error.message : '请检查网络后重试。'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button className="settings-logout-button" type="button" onClick={() => setConfirmOpen(true)} disabled={loading}>
        {loading ? <AuthSpinner size={16} /> : <LogOut size={16} aria-hidden="true" />}
        <span>{loading ? '正在退出' : '退出登录'}</span>
      </button>
      <CenteredDialog
        open={confirmOpen}
        title="退出登录"
        description="确定要退出当前账号吗？"
        className="logout-confirm-dialog"
        onClose={() => {
          if (!loading) setConfirmOpen(false)
        }}
        footer={
          <>
            <button className="ui-secondary-button" type="button" onClick={() => setConfirmOpen(false)} disabled={loading}>
              取消
            </button>
            <button className="settings-logout-confirm" type="button" onClick={() => void logout()} disabled={loading} aria-busy={loading || undefined}>
              {loading ? <AuthSpinner size={16} /> : <LogOut size={16} aria-hidden="true" />}
              <span>{loading ? '正在退出' : '退出登录'}</span>
            </button>
          </>
        }
      >
        <p className="logout-confirm-copy">退出后将返回登录页，当前账号的临时草稿、页面缓存和内存数据会被清理。</p>
      </CenteredDialog>
    </>
  )
}
