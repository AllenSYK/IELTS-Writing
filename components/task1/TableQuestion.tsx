'use client'

import type { Task1ChartSpec } from '@/lib/task1-chart-schema'

type Props = {
  spec: Task1ChartSpec
}

export function TableQuestion({ spec }: Props) {
  if (!spec.tableData) {
    return <div className="task1-chart-empty">表格数据不完整</div>
  }

  const { columns, rows } = spec.tableData

  return (
    <div className="task1-chart-wrapper">
      {spec.title && <h3 className="task1-chart-title">{spec.title}</h3>}
      {spec.subtitle && <p className="task1-chart-subtitle">{spec.subtitle}</p>}
      <div className="task1-table-container">
        <table className="task1-table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className={colIdx === 0 ? 'task1-table-label' : 'task1-table-value'}>
                    {typeof cell === 'number' ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {spec.source && <p className="task1-chart-source">{spec.source}</p>}
    </div>
  )
}
