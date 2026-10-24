'use client'

import { useEffect, useState } from 'react'
import { AdminPreviewCookieName } from '@/lib/auth/route-access'

/**
 * 管理员“用户端预览”提示条。
 * 仅在预览 Cookie 存在时显示，帮助管理员返回后台；
 * 预览不授予额外数据权限，只影响路由放行。
 */
export function AdminPreviewBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.queueMicrotask(() => {
      const hasCookie = document.cookie
        .split(';')
        .some((part) => part.trim().startsWith(`${AdminPreviewCookieName}=`))
      setVisible(hasCookie)
    })
  }, [])

  if (!visible) return null

  function exitPreview() {
    document.cookie = `${AdminPreviewCookieName}=; path=/; max-age=0; SameSite=Lax`
    window.location.assign('/admin')
  }

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 16px',
        background: '#1f2937',
        color: '#f9fafb',
        fontSize: 13
      }}
    >
      <span>管理员预览模式：正在以你自己的账号查看用户端界面，不涉及其他用户数据。</span>
      <button
        type="button"
        onClick={exitPreview}
        style={{
          border: '1px solid rgba(255,255,255,0.4)',
          background: 'transparent',
          color: 'inherit',
          borderRadius: 8,
          padding: '4px 12px',
          cursor: 'pointer'
        }}
      >
        返回后台
      </button>
    </div>
  )
}
