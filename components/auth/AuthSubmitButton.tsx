'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function AuthSpinner({ size = 18 }: { size?: number }) {
  return <Loader2 className="auth-loading-spinner" size={size} aria-hidden="true" />
}

type AuthSubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode
  icon?: ReactNode
  loading: boolean
  loadingLabel: string
}

export function AuthSubmitButton({
  children,
  className = '',
  disabled,
  icon,
  loading,
  loadingLabel,
  ...props
}: AuthSubmitButtonProps) {
  return (
    <button
      {...props}
      className={`ui-primary-button auth-submit auth-main-button auth-submit-button ${className}`.trim()}
      disabled={Boolean(disabled || loading)}
      aria-busy={loading || undefined}
    >
      <span className="auth-submit-content" aria-live="polite">
        {loading ? <AuthSpinner /> : icon}
        <span>{loading ? loadingLabel : children}</span>
      </span>
    </button>
  )
}
