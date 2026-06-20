import type { LegalSection } from '@/lib/legal-content'

export function LegalSections({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <>
      {sections.map(([title, body], index) => (
        <section key={title} className="legal-section">
          <h2>{index + 1}. {title}</h2>
          <p>{body}</p>
        </section>
      ))}
    </>
  )
}
