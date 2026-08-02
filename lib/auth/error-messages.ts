export function toChineseAuthError(message?: string | null) {
  const value = (message || '').toLowerCase()

  if (value.includes('invalid login credentials')) return '邮箱或密码错误'
  if (value.includes('email not confirmed')) return '邮箱尚未验证'
  if (value.includes('already registered') || value.includes('already been registered')) return '该邮箱已经注册'
  if (value.includes('invalid otp') || value.includes('invalid token')) return '验证码错误'
  if (value.includes('expired')) return '验证码已过期，请重新发送'
  if (value.includes('too many') || value.includes('rate limit')) return '操作过于频繁，请稍后重试'
  if (value.includes('password')) return '密码不符合要求，请至少输入 8 位'
  if (value.includes('fetch failed') || value.includes('network')) return '网络连接失败，请稍后重试'
  if (value.includes('resend_api_key')) return '邮件服务尚未配置，请联系管理员'
  if (value.includes('domain')) return '发件域名尚未完成验证，请联系管理员'

  return message && !/[a-z]{3,}/i.test(message) ? message : '请求失败，请稍后重试'
}

export function toPasswordRecoveryError(message?: string | null) {
  const value = (message || '').toLowerCase()

  if (
    value.includes('expired') ||
    value.includes('otp_expired') ||
    value.includes('token has expired')
  ) {
    return '验证码已过期，请重新发送。'
  }

  if (
    value.includes('invalid otp') ||
    value.includes('invalid token') ||
    value.includes('otp invalid') ||
    value.includes('token invalid')
  ) {
    return '验证码不正确，请重新输入。'
  }

  if (
    value.includes('rate limit') ||
    value.includes('too many requests') ||
    value.includes('email rate limit') ||
    value.includes('over_email_send_rate_limit')
  ) {
    return '操作过于频繁，请稍后再试。'
  }

  if (
    value.includes('same password') ||
    value.includes('different from the old password') ||
    value.includes('new password should be different')
  ) {
    return '新密码不能与原密码相同。'
  }

  if (
    value.includes('weak password') ||
    value.includes('password should be') ||
    value.includes('password is too short')
  ) {
    return '新密码强度不足，请使用至少 8 位密码。'
  }

  if (
    value.includes('session') ||
    value.includes('recovery') ||
    value.includes('jwt')
  ) {
    return '验证状态已失效，请重新获取验证码。'
  }

  if (
    value.includes('abort') ||
    value.includes('timeout') ||
    value.includes('timed out')
  ) {
    return '请求超时，请检查网络后重试。'
  }

  if (
    value.includes('network') ||
    value.includes('fetch failed') ||
    value.includes('failed to fetch')
  ) {
    return '网络连接失败，请稍后重试。'
  }

  return '操作失败，请稍后重试。'
}
