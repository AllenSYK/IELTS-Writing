import { GlassPanel } from '@/components/app-ui'
import { LegalSections } from '@/components/legal/LegalSections'
import { TermsSections } from '@/lib/legal-content'

export default function TermsPage() {
  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="legal-main">
        <header className="page-section-header">
          <div>
            <h1 className="ui-title-headline">服务条款</h1>
            <p className="ui-body-lg">最后更新：2026年6月</p>
          </div>
        </header>
        <GlassPanel className="legal-card">
          <LegalSections sections={TermsSections} />
        </GlassPanel>
      </section>
    </main>
  )
}
