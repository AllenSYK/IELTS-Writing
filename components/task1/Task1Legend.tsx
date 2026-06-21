type LegendItem = {
  color: string
  label: string
  value?: string
}

type Task1LegendProps = {
  items: LegendItem[]
  className?: string
}

export function Task1Legend({ items, className }: Task1LegendProps) {
  return (
    <ul className={`task1-html-legend ${className ?? ''}`.trim()} aria-label="图例">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="task1-html-legend-item">
          <span className="task1-html-legend-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
          <span className="task1-html-legend-label">{item.label}</span>
          {item.value ? <span className="task1-html-legend-value">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  )
}
