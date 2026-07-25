import { GlassPanel } from '@/components/app-ui'
import { LegalSections } from '@/components/legal/LegalSections'
import { PrivacySections, TermsEffectiveDate } from '@/lib/legal-content'

export default function PrivacyPage() {
  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="legal-main">
        <header className="page-section-header">
          <div>
            <h1 className="ui-title-headline">隐私政策</h1>
            <p className="ui-body-lg">空与梦的雅思写作</p>
            <p className="ui-body-md" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
              生效日期：{TermsEffectiveDate} · 最近更新：{TermsEffectiveDate}
            </p>
          </div>
        </header>
        <GlassPanel className="legal-card">
          <LegalSections sections={PrivacySections} />
        </GlassPanel>
      </section>
    </main>
  )
}
