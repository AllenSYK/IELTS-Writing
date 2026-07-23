/**
 * Error handling utilities for user-facing error messages.
 * Prevents technical errors from being displayed to users.
 */

// Technical error patterns that should never be shown to users
const TECHNICAL_PATTERNS = [
  /not found/i,
  /404/,
  /500/,
  /internal server error/i,
  /failed to fetch/i,
  /json/i,
  /parse/i,
  /syntax/i,
  /undefined/i,
  /null/i,
  /supabase/i,
  /api/i,
  /provider/i,
  /schema/i,
  /stack trace/i,
  /evaluat/i,
  /record_id/i,
  /draft_id/i,
  /fetch/i,
  /network/i,
  /abort/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
]

// User-friendly error messages by context
const CONTEXT_MESSAGES: Record<string, { title: string; message: string }> = {
  // Question loading
  'question-load': {
    title: '题目加载失败',
    message: '内容暂时加载失败，请重试',
  },
  'past-paper-load': {
    title: '真题加载失败',
    message: '真题内容暂时加载失败，请重试',
  },
  'custom-task-load': {
    title: '题目加载失败',
    message: '自定义题目暂时加载失败，请重试',
  },
  
  // Draft operations
  'draft-save': {
    title: '保存失败',
    message: '暂时无法同步，内容仍可继续编辑',
  },
  'draft-load': {
    title: '草稿加载失败',
    message: '草稿暂时加载失败，将创建新草稿',
  },
  'draft-create': {
    title: '创建失败',
    message: '无法创建写作草稿，请重试',
  },
  
  // Evaluation
  'evaluation-submit': {
    title: '提交失败',
    message: '提交失败，请稍后重试',
  },
  'evaluation-cancel': {
    title: '已取消',
    message: '批改已取消',
  },
  
  // Network
  'network-offline': {
    title: '当前离线',
    message: '当前离线，内容已保存在本地',
  },
  'network-error': {
    title: '网络错误',
    message: '网络连接失败，请检查网络后重试',
  },
  
  // Generic
  'unknown': {
    title: '操作失败',
    message: '操作失败，请稍后重试',
  },
}

export type ErrorContext = keyof typeof CONTEXT_MESSAGES

/**
 * Convert any error to a user-facing error message.
 * Technical details are logged to console.error but never shown to users.
 */
export function toUserFacingError(
  error: unknown,
  context: ErrorContext = 'unknown'
): { title: string; message: string } {
  // Log technical error for debugging
  if (error instanceof Error) {
    console.error(`[${context}]`, {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  } else {
    console.error(`[${context}]`, error)
  }

  // Get context-specific message
  const contextMessage = CONTEXT_MESSAGES[context] || CONTEXT_MESSAGES['unknown']

  // Check if error message is already user-friendly (Chinese)
  if (error instanceof Error && isUserFriendlyMessage(error.message)) {
    return {
      title: contextMessage.title,
      message: error.message,
    }
  }

  return contextMessage
}

/**
 * Check if a message is user-friendly (contains Chinese characters and doesn't contain technical patterns)
 */
function isUserFriendlyMessage(message: string): boolean {
  // Must contain Chinese characters
  const hasChinese = /[\u4e00-\u9fa5]/.test(message)
  if (!hasChinese) return false

  // Must not contain technical patterns
  return !TECHNICAL_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Convert error to user-facing message string (simplified version for toast messages)
 */
export function toUserFacingMessage(error: unknown, context: ErrorContext = 'unknown'): string {
  return toUserFacingError(error, context).message
}

/**
 * Handle 404 responses appropriately based on context
 */
export function handle404(context: 'writing' | 'history' | 'draft'): { title: string; message: string } | null {
  switch (context) {
    case 'writing':
      // In writing page, 404 means no previous record - this is normal
      return null
    case 'history':
      return {
        title: '记录不存在',
        message: '该记录不存在或已被删除',
      }
    case 'draft':
      // In draft recovery, 404 means no recoverable draft - create new one
      return null
    default:
      return {
        title: '内容不存在',
        message: '请求的内容不存在',
      }
  }
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true
  }
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('offline') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    )
  }
  return false
}

/**
 * Check if error is a 404
 */
export function is404Error(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('404') || error.message.includes('Not found')
  }
  return false
}
