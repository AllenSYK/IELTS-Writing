'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin-error]', {
      message: error.message,
      digest: error.digest,
      name: error.name
    })
  }, [error])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      padding: 48
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#fee2e2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
          fontSize: 24
        }}>
          !
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          管理页面加载失败
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 }}>
          {error.message || '管理后台页面加载时发生错误，请重试。'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            重试
          </button>
          <a
            href="/admin"
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            返回管理首页
          </a>
        </div>
        {error.digest && (
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 16 }}>
            错误ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
