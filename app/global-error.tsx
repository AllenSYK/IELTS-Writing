'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', {
      message: error.message,
      digest: error.digest,
      name: error.name
    })
  }, [error])

  return (
    <html lang="zh-CN">
      <body style={{
        margin: 0,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#f5f5f7',
        color: '#1d1d1f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        <main style={{
          textAlign: 'center',
          padding: '48px 24px',
          maxWidth: 480
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#fee2e2',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            fontSize: 28
          }}>
            !
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>
            页面出现错误
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
            抱歉，页面加载过程中发生了问题。请尝试刷新页面。
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              重试
            </button>
            <a
              href="/dashboard"
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              返回首页
            </a>
          </div>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 24 }}>
              错误ID: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
