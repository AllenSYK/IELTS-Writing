/**
 * 全局交互优化
 * 
 * 确保所有可点击元素立即响应，无动画延迟
 */

// 添加全局点击反馈样式
export function addGlobalClickFeedback() {
  if (typeof document === 'undefined') return

  const style = document.createElement('style')
  style.textContent = `
    /* 禁用所有点击动画，确保立即响应 */
    button, a, [role="button"] {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      transition: none !important;
      animation: none !important;
    }

    /* 移除所有点击动画 */
    button:active, a:active, [role="button"]:active {
      transform: none !important;
      animation: none !important;
    }

    /* 输入框即时响应 */
    input, textarea, select {
      transition: none !important;
    }

    /* 减少动画模式 */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0ms !important;
        transition-duration: 0ms !important;
      }
    }
  `
  document.head.appendChild(style)
}

// 初始化所有交互优化
export function initInteractionOptimizations() {
  if (typeof window === 'undefined') return

  addGlobalClickFeedback()
}
