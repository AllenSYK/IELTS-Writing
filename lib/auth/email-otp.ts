import { EMAIL_OTP_LENGTH } from './otp-constants'

export function sanitizeEmailOtpCode(value: string, length = EMAIL_OTP_LENGTH) {
  return value.replace(/\D/g, '').slice(0, length)
}

export function isEmailOtpCode(value: string, length = EMAIL_OTP_LENGTH) {
  return new RegExp(`^\\d{${length}}$`).test(value)
}
