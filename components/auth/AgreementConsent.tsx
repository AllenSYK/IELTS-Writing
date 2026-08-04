'use client'

import { useEffect, useRef, useState, type UIEvent } from 'react'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { LegalSections } from '@/components/legal/LegalSections'
import {
  PrivacyEffectiveDate,
  PrivacySections,
  TermsEffectiveDate,
  TermsSections
} from '@/lib/legal-content'

type OpenDocument = 'terms' | 'privacy' | 'required-reading'

const ScrollEndThreshold = 12

export function AgreementConsent({
  checked,
  disabled = false,
  requireReading = false,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  requireReading?: boolean
  onChange: (checked: boolean) => void
}) {
  const readerRef = useRef<HTMLDivElement>(null)
  const [openDocument, setOpenDocument] = useState<OpenDocument | null>(null)
  const [hasReachedEnd, setHasReachedEnd] = useState(false)
  const isRequiredReading = openDocument === 'required-reading'

  useEffect(() => {
    if (!isRequiredReading) return

    const frame = window.requestAnimationFrame(() => {
      const reader = readerRef.current
      if (!reader) return
      reader.scrollTop = 0
      setHasReachedEnd(reader.scrollHeight <= reader.clientHeight + ScrollEndThreshold)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isRequiredReading])

  function closeDocument() {
    setOpenDocument(null)
  }

  function handleRequiredReadingScroll(event: UIEvent<HTMLDivElement>) {
    const reader = event.currentTarget
    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - ScrollEndThreshold) {
      setHasReachedEnd(true)
    }
  }

  const title = openDocument === 'terms'
    ? '服务条款'
    : openDocument === 'privacy'
      ? '隐私政策'
      : '请阅读服务条款与隐私政策'
  const description = openDocument === 'terms'
    ? `最近更新：${TermsEffectiveDate}`
    : openDocument === 'privacy'
      ? `最近更新：${PrivacyEffectiveDate}`
      : '隐私政策已包含个人信息跨境传输说明，请阅读至底部后确认同意。'

  return (
    <>
      <div className="agreement-row">
        <label className="agreement-consent">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => {
              if (!event.target.checked) {
                onChange(false)
                return
              }
              if (requireReading) {
                setHasReachedEnd(false)
                setOpenDocument('required-reading')
                return
              }
              onChange(true)
            }}
          />
          <span className="agreement-copy">
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
      </div>

      <CenteredDialog
        open={Boolean(openDocument)}
        title={title}
        description={description}
        className="legal-consent-dialog"
        bodyClassName={`legal-consent-body${isRequiredReading ? ' legal-required-reading-body' : ''}`}
        onClose={closeDocument}
        footer={isRequiredReading ? (
          <>
            <button className="ui-secondary-button" type="button" onClick={closeDocument}>
              暂不同意
            </button>
            <button
              className="ui-primary-button"
              type="button"
              disabled={!hasReachedEnd}
              onClick={() => {
                onChange(true)
                closeDocument()
              }}
            >
              {hasReachedEnd ? '同意并继续' : '请阅读至底部'}
            </button>
          </>
        ) : undefined}
      >
        {isRequiredReading ? (
          <div
            ref={readerRef}
            className="legal-required-reader"
            onScroll={handleRequiredReadingScroll}
            tabIndex={0}
            aria-label="服务条款与隐私政策全文"
          >
            <div className="legal-required-document-heading">
              <span>第一部分</span>
              <h3>服务条款</h3>
              <p>生效及最近更新日期：{TermsEffectiveDate}</p>
            </div>
            <LegalSections sections={TermsSections} />
            <div className="legal-required-document-heading">
              <span>第二部分</span>
              <h3>隐私政策（含个人信息跨境传输说明）</h3>
              <p>生效及最近更新日期：{PrivacyEffectiveDate}</p>
            </div>
            <LegalSections sections={PrivacySections} />
            <p className="legal-required-end" role="status">
              已阅读至协议末尾，可点击“同意并继续”。
            </p>
          </div>
        ) : (
          <LegalSections sections={openDocument === 'terms' ? TermsSections : PrivacySections} />
        )}
      </CenteredDialog>
    </>
  )
}
