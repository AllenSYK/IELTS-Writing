import { sanitizeEmailOtpCode } from './email-otp'
import { EMAIL_OTP_LENGTH } from './otp-constants'

export type OtpInputModelResult = {
  cells: string[]
  focusIndex: number
}

export function createOtpCells(value: string, length = EMAIL_OTP_LENGTH) {
  const code = sanitizeEmailOtpCode(value, length)
  return Array.from({ length }, (_, index) => code[index] || '')
}

export function applyOtpInput(cells: string[], index: number, rawValue: string): OtpInputModelResult {
  const entered = sanitizeEmailOtpCode(rawValue, cells.length)
  const nextCells = [...cells]

  if (entered.length <= 1) {
    nextCells[index] = entered
    return {
      cells: nextCells,
      focusIndex: entered ? Math.min(index + 1, cells.length - 1) : index
    }
  }

  entered.split('').forEach((digit, offset) => {
    const targetIndex = index + offset
    if (targetIndex < cells.length) nextCells[targetIndex] = digit
  })
  return {
    cells: nextCells,
    focusIndex: Math.min(index + entered.length, cells.length - 1)
  }
}

export function applyOtpPaste(cells: string[], index: number, rawValue: string): OtpInputModelResult {
  const pasted = sanitizeEmailOtpCode(rawValue, cells.length)
  if (!pasted) return { cells, focusIndex: index }

  const startIndex = pasted.length >= cells.length ? 0 : index
  const nextCells = pasted.length >= cells.length ? Array.from({ length: cells.length }, () => '') : [...cells]
  pasted.split('').forEach((digit, offset) => {
    const targetIndex = startIndex + offset
    if (targetIndex < cells.length) nextCells[targetIndex] = digit
  })
  return {
    cells: nextCells,
    focusIndex: Math.min(startIndex + pasted.length, cells.length - 1)
  }
}

export function applyOtpBackspace(cells: string[], index: number): OtpInputModelResult {
  if (!cells[index]) {
    return { cells, focusIndex: Math.max(0, index - 1) }
  }

  const nextCells = [...cells]
  nextCells[index] = ''
  return { cells: nextCells, focusIndex: index }
}

export function getOtpNavigationIndex(key: string, index: number, length = EMAIL_OTP_LENGTH) {
  if (key === 'ArrowLeft') return Math.max(0, index - 1)
  if (key === 'ArrowRight') return Math.min(length - 1, index + 1)
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return null
}
