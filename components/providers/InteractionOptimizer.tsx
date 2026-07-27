'use client'

import { useEffect } from 'react'
import { initInteractionOptimizations } from '@/lib/interaction-optimizer'

/**
 * 交互优化提供者
 * 
 * 在应用初始化时添加全局交互优化
 */
export function InteractionOptimizer() {
  useEffect(() => {
    initInteractionOptimizations()
  }, [])

  return null
}
