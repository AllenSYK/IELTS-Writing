export function WritingEditorSkeleton() {
  return (
    <section className="writing-editor-skeleton" aria-hidden="true">
      <div className="writing-editor-skeleton-toolbar">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
      <div className="skeleton-block writing-editor-skeleton-canvas" />
    </section>
  )
}
