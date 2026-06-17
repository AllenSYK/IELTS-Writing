'use client'

import Link from 'next/link'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { MaterialIcon } from '@/components/stitch-ui'
import type { SupportFaq } from '@/lib/support-feedback'

export function FaqDialog({
  faq,
  open,
  onClose,
  onUseFeedback
}: {
  faq: SupportFaq | null
  open: boolean
  onClose: () => void
  onUseFeedback: (faq: SupportFaq) => void
}) {
  if (!faq) return null

  return (
    <CenteredDialog
      open={open}
      title={faq.title}
      description="解决方案"
      className="faq-dialog"
      bodyClassName="faq-dialog-scroll"
      onClose={onClose}
      footer={
        <>
          {faq.actions.map((action) => action.kind === 'feedback' ? (
            <button key={action.label} className="stitch-primary-button" type="button" onClick={() => onUseFeedback(faq)}>
              <MaterialIcon name="send" size={18} />
              {action.label}
            </button>
          ) : action.href ? (
            <Link key={action.label} className="stitch-secondary-button" href={action.href} onClick={onClose}>
              {action.label}
            </Link>
          ) : null)}
          <button className="stitch-secondary-button" type="button" onClick={onClose}>
            关闭
          </button>
        </>
      }
    >
      <div className="faq-dialog-title-row">
        <span className="faq-dialog-icon">
          <MaterialIcon name="contact_support" size={22} />
        </span>
        <span className="task-badge">{faq.category}</span>
      </div>
      <ol className="faq-steps">
        {faq.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </CenteredDialog>
  )
}
