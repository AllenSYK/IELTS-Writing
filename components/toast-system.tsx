'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { MaterialIcon } from '@/components/app-ui'

export type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'loading'

export type Toast = {
  id: string
  kind: ToastKind
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

export type ToastInput = Omit<Toast, 'id'>

export type ToastContextValue = {
  pushToast: (toast: ToastInput) => string
  dismissToast: (id: string) => void
  updateToast: (id: string, toast: Partial<ToastInput>) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside AppInteractionProvider')
  return context
}

export function ToastViewport({ toasts, dismissToast }: { toasts: Toast[]; dismissToast: (id: string) => void }) {
  return (
    <div className="toast-viewport" role="region" aria-label="状态通知">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">
            <MaterialIcon
              name={
                toast.kind === 'success'
                  ? 'check_circle'
                  : toast.kind === 'error'
                    ? 'error'
                    : toast.kind === 'warning'
                      ? 'warning'
                      : toast.kind === 'loading'
                        ? 'progress_activity'
                        : 'info'
              }
              size={18}
            />
          </span>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <span>{toast.message}</span> : null}
          </div>
          {toast.actionLabel && toast.onAction ? (
            <button className="toast-action" type="button" onClick={toast.onAction}>
              {toast.actionLabel}
            </button>
          ) : null}
          <button className="toast-close" type="button" aria-label="关闭通知" onClick={() => dismissToast(toast.id)}>
            <MaterialIcon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastErrorTitles = useRef(new Map<string, number>())

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (input: ToastInput) => {
      const now = Date.now()
      const last = lastErrorTitles.current.get(`${input.kind}:${input.title}`) ?? 0
      if (input.kind === 'error' && now - last < 1200) {
        return ''
      }
      lastErrorTitles.current.set(`${input.kind}:${input.title}`, now)

      const id = createId('toast')
      const toast: Toast = { id, ...input }
      setToasts((current) => [toast, ...current.filter((item) => item.title !== input.title).slice(0, 3)])
      if (input.kind !== 'loading') {
        window.setTimeout(() => dismissToast(id), input.durationMs ?? (input.kind === 'error' ? 7200 : 2800))
      }
      return id
    },
    [dismissToast]
  )

  const updateToast = useCallback((id: string, input: Partial<ToastInput>) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...input } : toast)))
  }, [])

  const context = useMemo(() => ({ pushToast, dismissToast, updateToast }), [dismissToast, pushToast, updateToast])

  return { toasts, dismissToast, context }
}
