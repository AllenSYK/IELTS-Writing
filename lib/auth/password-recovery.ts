export const PASSWORD_RECOVERY_RESEND_SECONDS = 60
export const PASSWORD_RECOVERY_MIN_PASSWORD_LENGTH = 8
export const PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH = 128

export function validateRecoveryPassword(password: string, confirmation: string) {
  if (password.length < PASSWORD_RECOVERY_MIN_PASSWORD_LENGTH) {
    return '新密码至少需要 8 位。'
  }

  if (password.length > PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH) {
    return '新密码不能超过 128 位。'
  }

  if (password !== confirmation) {
    return '两次输入的密码不一致。'
  }

  return ''
}
