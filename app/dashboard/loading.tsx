export default function DashboardLoading() {
  return (
    <main className="ui-page dashboard-page" tabIndex={-1} aria-busy="true">
      <section className="dashboard-main dashboard-skeleton">
        <div className="dashboard-header">
          <div className="skeleton-line dashboard-skeleton-title" />
          <div className="skeleton-line dashboard-skeleton-actions" />
        </div>
        <div className="dashboard-grid">
          {Array.from({ length: 3 }, (_, index) => <div className="dashboard-card skeleton-card" key={index} />)}
        </div>
        <div className="dashboard-panel skeleton-block" />
        <div className="dashboard-panel activity-skeleton" aria-label="正在加载写作热力图">
          <div className="skeleton-line dashboard-skeleton-title" />
          <div className="activity-skeleton-grid">
            {Array.from({ length: 371 }, (_, index) => <span key={index} />)}
          </div>
        </div>
        <span className="sr-only" role="status" aria-live="polite">正在加载账号中心</span>
      </section>
    </main>
  )
}
