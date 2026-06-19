export function QuestionSkeleton() {
  return (
    <section className="question-skeleton" aria-hidden="true">
      <div className="skeleton-line question-skeleton-kicker" />
      <div className="skeleton-line question-skeleton-title" />
      <div className="skeleton-line question-skeleton-copy" />
      <div className="skeleton-line question-skeleton-copy is-short" />
    </section>
  )
}
