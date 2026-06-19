'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { clearUserRouteMemoryCaches } from '@/lib/user-route-cache'

export function LogoutButton() {
  const router = useRouter()
  const { userId, prepareForLogout } = useUserSession()

  async function logout() {
    const supabase = createSupabaseBrowserClient()
    if (userId) clearUserRouteMemoryCaches(userId)
    prepareForLogout()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <button className="ui-secondary-button" type="button" onClick={logout}>
      <LogOut size={16} />
      退出登录
    </button>
  )
}
