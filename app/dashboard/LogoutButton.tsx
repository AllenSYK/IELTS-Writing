'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function LogoutButton() {
  const router = useRouter()

  async function logout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <button className="stitch-secondary-button" type="button" onClick={logout}>
      <LogOut size={16} />
      退出登录
    </button>
  )
}
