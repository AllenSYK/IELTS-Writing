export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function maskEmail(email: string) {
  const normalized = normalizeEmail(email)
  const [name, domain] = normalized.split('@')
  if (!name || !domain) return normalized

  const visible = name.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(3, Math.min(6, name.length - 1)))}@${domain}`
}
