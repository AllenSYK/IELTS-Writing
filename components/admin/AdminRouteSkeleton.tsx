import { AdminTableSkeleton } from './AdminUI'

export function AdminRouteSkeleton({
  variant = 'table',
  columns = 8
}: {
  variant?: 'overview' | 'table' | 'settings'
  columns?: number
}) {
  return (
    <main className="admin-section admin-route-skeleton" data-main-content aria-busy="true" aria-label="正在加载页面">
      <header className="admin-page-header">
        <div className="admin-route-skeleton-heading">
          <span />
          <span />
          <span />
        </div>
      </header>

      {variant === 'overview' ? (
        <>
          <section className="admin-stat-grid admin-stat-grid-six" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="admin-stat-card admin-skeleton-card" key={index} />
            ))}
          </section>
          <section className="admin-dashboard-grid" aria-hidden="true">
            <article className="admin-panel admin-panel-span-2"><AdminTableSkeleton columns={3} rows={4} /></article>
            <article className="admin-panel"><AdminTableSkeleton columns={2} rows={4} /></article>
            <article className="admin-panel admin-panel-span-2"><AdminTableSkeleton columns={4} rows={5} /></article>
            <article className="admin-panel"><AdminTableSkeleton columns={2} rows={5} /></article>
          </section>
        </>
      ) : variant === 'settings' ? (
        <section className="admin-settings-layout" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="admin-panel admin-route-skeleton-card" key={index}>
              <AdminTableSkeleton columns={2} rows={index === 0 ? 4 : 3} />
            </article>
          ))}
        </section>
      ) : (
        <section className="admin-panel admin-table-panel" aria-hidden="true">
          <div className="admin-route-skeleton-toolbar admin-skeleton-card" />
          <AdminTableSkeleton columns={columns} rows={7} />
        </section>
      )}
    </main>
  )
}
