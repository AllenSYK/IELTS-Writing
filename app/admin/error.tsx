'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react'

interface AdminErrorProps {
  error: Error & { digest?: string; status?: number; code?: string; requestId?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  const router = useRouter()
  const [showDetails, setShowDetails] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // 根据错误类型确定显示内容
  const errorStatus = error.status || (error as unknown as { digest?: { status?: number } })?.digest?.status
  const is401 = errorStatus === 401
  const is403 = errorStatus === 403
  const is404 = errorStatus === 404
  const isNetworkError = error.message?.includes('网络') || error.message?.includes('fetch')
  const isAbortError = error.code === 'ABORTED'

  useEffect(() => {
    // 只在开发环境记录详细错误
    if (process.env.NODE_ENV === 'development') {
      console.error('[admin-error]', {
        message: error.message,
        digest: error.digest,
        name: error.name,
        status: errorStatus,
        code: error.code,
        requestId: error.requestId
      })
    }
  }, [error, errorStatus])

  // 401 错误自动跳转登录
  useEffect(() => {
    if (is401) {
      router.push('/login?returnTo=/admin')
    }
  }, [is401, router])

  // Abort 错误不显示
  if (isAbortError) {
    return null
  }

  const handleReset = async () => {
    setIsResetting(true)
    try {
      await reset()
    } finally {
      setIsResetting(false)
    }
  }

  const getTitle = () => {
    if (is401) return '登录已过期'
    if (is403) return '权限不足'
    if (is404) return '页面不存在'
    if (isNetworkError) return '网络连接失败'
    return '管理页面加载失败'
  }

  const getMessage = () => {
    if (is401) return '请重新登录以继续操作。'
    if (is403) return '您没有权限访问此页面，请联系管理员。'
    if (is404) return '请求的页面不存在，请检查链接是否正确。'
    if (isNetworkError) return '无法连接到服务器，请检查网络后重试。'
    return error.message || '管理后台页面加载时发生错误，请重试。'
  }

  const getIconColor = () => {
    if (is401 || is403) return '#f59e0b'
    if (is404) return '#6b7280'
    if (isNetworkError) return '#3b82f6'
    return '#ef4444'
  }

  return (
    <div className="admin-error-boundary">
      <div className="admin-error-content">
        <div className="admin-error-icon" style={{ background: `${getIconColor()}15`, color: getIconColor() }}>
          <AlertTriangle size={28} />
        </div>
        
        <h2 className="admin-error-title">{getTitle()}</h2>
        
        <p className="admin-error-message">{getMessage()}</p>

        {error.requestId && (
          <p className="admin-error-request-id">
            请求ID: <code>{error.requestId}</code>
          </p>
        )}

        <div className="admin-error-actions">
          {!is401 && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="admin-primary-button"
            >
              <RefreshCw size={16} className={isResetting ? 'admin-spin' : ''} />
              {isResetting ? '重试中...' : '重试'}
            </button>
          )}
          
          {!is401 && !is403 && (
            <button
              onClick={() => router.push('/admin')}
              className="admin-secondary-button"
            >
              <Home size={16} />
              返回管理首页
            </button>
          )}

          {is401 && (
            <button
              onClick={() => router.push('/login?returnTo=/admin')}
              className="admin-primary-button"
            >
              重新登录
            </button>
          )}
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="admin-error-debug">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="admin-error-toggle"
            >
              {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showDetails ? '隐藏详情' : '显示详情'}
            </button>
            
            {showDetails && (
              <pre className="admin-error-stack">
                {error.digest && `Digest: ${error.digest}\n`}
                {errorStatus && `Status: ${errorStatus}\n`}
                {error.code && `Code: ${error.code}\n`}
                {error.requestId && `Request ID: ${error.requestId}\n`}
                {error.stack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
