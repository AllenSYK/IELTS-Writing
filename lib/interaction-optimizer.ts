/**
 * 全局交互优化
 * 
 * 确保所有可点击元素在100ms内有视觉反馈
 */

// 添加全局点击反馈样式
export function addGlobalClickFeedback() {
  if (typeof document === 'undefined') return

  const style = document.createElement('style')
  style.textContent = `
    /* 全局点击反馈 */
    button, a, [role="button"], [tabindex] {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    /* 点击动画 */
    @keyframes click-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(0.97); }
      100% { transform: scale(1); }
    }

    /* 所有可点击元素的即时反馈 */
    button:active, a:active, [role="button"]:active {
      animation: click-pulse 0.1s ease-out;
    }

    /* 禁用状态不显示动画 */
    button:disabled, [disabled] {
      animation: none !important;
    }

    /* Link 和按钮的 hover 过渡 */
    button, a, [role="button"] {
      transition: background-color 0.08s ease, color 0.08s ease, box-shadow 0.08s ease, transform 0.08s ease;
    }

    /* 侧边栏链接特殊处理 */
    .sidebar-link {
      transition: background-color 0.06s ease, color 0.06s ease, transform 0.06s ease !important;
    }

    .sidebar-link:active {
      transform: scale(0.96) !important;
      background-color: var(--surface-variant) !important;
    }

    /* 按钮点击反馈 */
    .ui-primary-button:active, 
    .ui-secondary-button:active,
    .ui-dark-button:active {
      transform: scale(0.97);
      opacity: 0.9;
    }

    /* 卡片点击反馈 */
    .ui-hover-glow:active {
      transform: scale(0.99);
    }

    /* 输入框即时聚焦 */
    input, textarea, select {
      transition: border-color 0.08s ease, box-shadow 0.08s ease;
    }

    /* Toast 动画 */
    @keyframes toast-enter {
      from { 
        opacity: 0; 
        transform: translateY(-10px) scale(0.98); 
      }
      to { 
        opacity: 1; 
        transform: translateY(0) scale(1); 
      }
    }

    .toast {
      animation: toast-enter 0.12s ease-out;
    }

    /* Modal 动画 */
    @keyframes modal-enter {
      from { 
        opacity: 0; 
        transform: scale(0.97); 
      }
      to { 
        opacity: 1; 
        transform: scale(1); 
      }
    }

    .confirm-dialog, [role="dialog"] {
      animation: modal-enter 0.12s ease-out;
    }

    /* 页面切换动画 */
    @keyframes page-swap {
      from { 
        opacity: 0; 
        transform: translateY(6px); 
      }
      to { 
        opacity: 1; 
        transform: translateY(0); 
      }
    }

    .app-content {
      animation: page-swap 0.12s ease-out;
    }

    /* Loading 状态 */
    @keyframes loading-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    [aria-busy="true"] {
      animation: loading-pulse 1s ease-in-out infinite;
    }

    /* 禁用元素样式 */
    button[disabled], input[disabled], select[disabled], textarea[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* 聚焦样式 */
    :focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    /* 减少动画模式 */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `
  document.head.appendChild(style)
}

// 添加点击事件监听器，提供触觉反馈（如果支持）
export function addClickHapticFeedback() {
  if (typeof document === 'undefined') return

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const clickable = target.closest('button, a, [role="button"], [tabindex]')
    
    if (clickable && 'vibrate' in navigator) {
      // 轻微振动反馈（如果支持）
      try {
        (navigator as any).vibrate(10)
      } catch {}
    }
  }, { passive: true })
}

// 优化滚动性能
export function optimizeScrollPerformance() {
  if (typeof document === 'undefined') return

  // 使用 passive 事件监听器
  const originalAddEventListener = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === 'scroll' || type === 'touchstart' || type === 'touchmove') {
      if (typeof options === 'object') {
        options.passive = true
      } else if (options === undefined) {
        options = { passive: true }
      }
    }
    return originalAddEventListener.call(this, type, listener, options)
  }
}

// 初始化所有交互优化
export function initInteractionOptimizations() {
  if (typeof window === 'undefined') return

  addGlobalClickFeedback()
  addClickHapticFeedback()
  optimizeScrollPerformance()
}
