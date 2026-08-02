'use client'

import {
  type ClipboardEvent,
  type CSSProperties,
  type ChangeEvent,
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { EMAIL_OTP_LENGTH } from '@/lib/auth/otp-constants'
import {
  applyOtpBackspace,
  applyOtpInput,
  applyOtpPaste,
  createOtpCells,
  getOtpNavigationIndex
} from '@/lib/auth/otp-input-model'

export type OtpCodeInputHandle = {
  focus: (index?: number) => void
}

export type OtpCodeInputProps = {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
  ariaLabel?: string
  ariaDescribedBy?: string
  name?: string
  id?: string
}

export const OtpCodeInput = forwardRef<OtpCodeInputHandle, OtpCodeInputProps>(function OtpCodeInput({
  value,
  onChange,
  length = EMAIL_OTP_LENGTH,
  disabled = false,
  invalid = false,
  autoFocus = false,
  ariaLabel = '邮箱验证码',
  ariaDescribedBy,
  name,
  id
}, forwardedRef) {
  const safeLength = Math.max(1, Math.floor(length))
  const generatedId = useId()
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const [cells, setCells] = useState(() => createOtpCells(value, safeLength))

  useEffect(() => {
    const nextCells = createOtpCells(value, safeLength)
    setCells((current) => current.length === safeLength && current.join('') === nextCells.join('') ? current : nextCells)
  }, [safeLength, value])

  useEffect(() => {
    if (!autoFocus || disabled) return
    inputRefs.current[0]?.focus()
  }, [autoFocus, disabled])

  useImperativeHandle(forwardedRef, () => ({
    focus(index = 0) {
      const safeIndex = Math.min(Math.max(index, 0), safeLength - 1)
      inputRefs.current[safeIndex]?.focus()
    }
  }), [safeLength])

  function commit(nextCells: string[]) {
    setCells(nextCells)
    onChange(nextCells.join(''))
  }

  function focus(index: number) {
    inputRefs.current[Math.min(Math.max(index, 0), safeLength - 1)]?.focus()
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const result = applyOtpInput(cells, index, event.target.value)
    commit(result.cells)
    if (result.focusIndex !== index || result.cells[index]) focus(result.focusIndex)
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const result = applyOtpPaste(cells, index, event.clipboardData.getData('text'))
    if (result.cells === cells) return
    commit(result.cells)
    focus(result.focusIndex)
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const result = applyOtpBackspace(cells, index)
      if (result.cells !== cells) commit(result.cells)
      focus(result.focusIndex)
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      if (cells[index]) {
        const nextCells = [...cells]
        nextCells[index] = ''
        commit(nextCells)
      }
      return
    }

    const navigationTarget = getOtpNavigationIndex(event.key, index, safeLength)

    if (navigationTarget !== null) {
      event.preventDefault()
      focus(navigationTarget)
    }
  }

  return (
    <div
      className={`code-input-grid${invalid ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}
      role="group"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      style={{ '--otp-length': safeLength } as CSSProperties}
    >
      {cells.map((digit, index) => {
        const inputId = index === 0 && id ? id : `${generatedId}-digit-${index + 1}`
        return (
          <input
            key={inputId}
            ref={(node) => {
              inputRefs.current[index] = node
            }}
            id={inputId}
            name={index === 0 ? name : undefined}
            type="text"
            value={digit}
            onChange={(event) => handleChange(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.currentTarget.select()}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={safeLength}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={ariaDescribedBy}
            aria-label={`${ariaLabel}，第 ${index + 1} 位，共 ${safeLength} 位`}
          />
        )
      })}
    </div>
  )
})
