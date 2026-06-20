'use client'

import { useState } from 'react'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { LegalSections } from '@/components/legal/LegalSections'
import { PrivacySections, TermsSections } from '@/lib/legal-content'

export function AgreementConsent({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const [openDocument, setOpenDocument] = useState<'terms' | 'privacy' | null>(null)
  const sections = openDocument === 'terms' ? TermsSections : PrivacySections

  return (
    <>
      <label className="agreement-consent">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          我已阅读并同意
          <button type="button" onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpenDocument('terms')
          }}>《服务条款》</button>
          和
          <button type="button" onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpenDocument('privacy')
          }}>《隐私政策》</button>
        </span>
      </label>

      <CenteredDialog
        open={Boolean(openDocument)}
        title={openDocument === 'terms' ? '服务条款' : '隐私政策'}
        description="最后更新：2026年6月"
        className="legal-consent-dialog"
        bodyClassName="legal-consent-body"
        onClose={() => setOpenDocument(null)}
      >
        <LegalSections sections={sections} />
      </CenteredDialog>
    </>
  )
}
