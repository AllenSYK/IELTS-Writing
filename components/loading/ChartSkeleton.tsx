export function ChartSkeleton() {
  return (
    <section className="chart-skeleton" aria-hidden="true">
      <div className="skeleton-line chart-skeleton-title" />
      <div className="chart-skeleton-bars">
        {[42, 68, 52, 82, 60, 74].map((height, index) => (
          <div className="skeleton-block chart-skeleton-bar" key={`${height}-${index}`} style={{ height: `${height}%` }} />
        ))}
      </div>
    </section>
  )
}
