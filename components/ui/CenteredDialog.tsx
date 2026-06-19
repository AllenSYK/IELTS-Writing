'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MaterialIcon } from '@/components/app-ui'

type CenteredDialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  closeLabel?: string
  onClose: () => void
}

function focusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((item) => !item.hasAttribute('aria-hidden'))
}

export function CenteredDialog({
  open,
  title,
  description,
  children,
  footer,
  className = '',
  bodyClassName = '',
  closeLabel = '关闭',
  onClose
}: CenteredDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.classList.add('modal-open')
    window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }))

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusables = focusableElements(dialogRef.current)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [onClose, open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="dialog-layer centered-dialog-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`centered-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="centered-dialog-header">
          <div>
            <h2 id={titleId} className="ui-title-md">{title}</h2>
            {description ? <p id={descriptionId} className="ui-body-md">{description}</p> : null}
          </div>
          <button ref={closeRef} className="ui-icon-button" type="button" aria-label={closeLabel} onClick={onClose}>
            <MaterialIcon name="close" size={18} />
          </button>
        </header>
        <div className={`centered-dialog-body ${bodyClassName}`}>{children}</div>
        {footer ? <footer className="centered-dialog-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  )
}
