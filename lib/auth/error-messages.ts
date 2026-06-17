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
