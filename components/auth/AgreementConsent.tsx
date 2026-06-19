'use client'

import Link from 'next/link'

export function AgreementConsent({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="agreement-consent">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        我已阅读并同意
        <Link href="/terms">《服务条款》</Link>
        和
        <Link href="/privacy">《隐私政策》</Link>
      </span>
    </label>
  )
}
