import { LegalContactEmail, type LegalSection } from '@/lib/legal-content'

function LegalBody({ body }: { body: string }) {
  const parts = body.split(LegalContactEmail)
  if (parts.length === 1) return body

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? <a href={`mailto:${LegalContactEmail}`}>{LegalContactEmail}</a> : null}
          {part}
        </span>
      ))}
    </>
  )
}

export function LegalSections({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <>
      {sections.map(([title, body], index) => (
        <section key={title} className="legal-section">
          <h2>{index + 1}. {title}</h2>
          <p><LegalBody body={body} /></p>
        </section>
      ))}
    </>
  )
}
