'use client'

/**
 * 地图基础元素组件
 * 
 * 包括：河流、道路、桥梁、房屋、树木、停车场、建筑排、教堂、步行路线
 */

// 河流组件
export function RiverShape({ path, className = '' }: { path: string; className?: string }) {
  return (
    <path
      d={path}
      className={`map-river ${className}`}
      fill="var(--map-river, #d1d5db)"
      stroke="var(--map-river-stroke, #9ca3af)"
      strokeWidth="1"
    />
  )
}

// 道路组件
export function RoadShape({ 
  x1, y1, x2, y2, 
  style = 'current',
  className = '' 
}: { 
  x1: number; y1: number; x2: number; y2: number
  style?: 'current' | 'future'
  className?: string 
}) {
  const strokeColor = style === 'future' 
    ? 'var(--map-future, #6b7280)' 
    : 'var(--map-road, #4b5563)'
  const strokeWidth = style === 'future' ? 3 : 4
  const dashArray = style === 'future' ? '8 6' : 'none'
  
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeDasharray={dashArray}
      strokeLinecap="round"
      className={`map-road ${className}`}
    />
  )
}

// 桥梁组件
export function BridgeShape({ 
  x, y, width, height,
  className = '' 
}: { 
  x: number; y: number; width: number; height: number
  className?: string 
}) {
  return (
    <rect
      x={x} y={y} width={width} height={height}
      fill="var(--map-bridge, #374151)"
      stroke="var(--map-bridge-stroke, #1f2937)"
      strokeWidth="2"
      rx="2"
      className={`map-bridge ${className}`}
    />
  )
}

// 房屋图标
export function HouseIcon({ 
  x, y, 
  size = 20,
  className = '' 
}: { 
  x: number; y: number
  size?: number
  className?: string 
}) {
  const halfSize = size / 2
  return (
    <g className={`map-house ${className}`} transform={`translate(${x}, ${y})`}>
      {/* 屋顶 */}
      <polygon
        points={`${-halfSize},0 0,${-halfSize} ${halfSize},0`}
        fill="var(--map-house-roof, #4b5563)"
        stroke="var(--map-house-roof-stroke, #374151)"
        strokeWidth="1"
      />
      {/* 墙体 */}
      <rect
        x={-halfSize + 2} y={0}
        width={size - 4} height={halfSize}
        fill="var(--map-house-wall, #e5e7eb)"
        stroke="var(--map-house-wall-stroke, #9ca3af)"
        strokeWidth="0.5"
      />
    </g>
  )
}

// 树木图标
export function TreeIcon({ 
  x, y, 
  size = 16,
  className = '' 
}: { 
  x: number; y: number
  size?: number
  className?: string 
}) {
  const halfSize = size / 2
  return (
    <g className={`map-tree ${className}`} transform={`translate(${x}, ${y})`}>
      {/* 树冠 */}
      <circle
        cx={0} cy={-halfSize}
        r={halfSize}
        fill="var(--map-tree-canopy, #6b7280)"
        stroke="var(--map-tree-canopy-stroke, #4b5563)"
        strokeWidth="0.5"
      />
      {/* 树干 */}
      <rect
        x={-2} y={-halfSize + 2}
        width={4} height={halfSize}
        fill="var(--map-tree-trunk, #78716c)"
      />
    </g>
  )
}

// 停车场组件
export function CarParkBlock({ 
  x, y, width, height,
  planned = false,
  label = 'Car park',
  className = '' 
}: { 
  x: number; y: number; width: number; height: number
  planned?: boolean
  label?: string
  className?: string 
}) {
  const borderColor = planned 
    ? 'var(--map-future, #6b7280)' 
    : 'var(--map-carpark-border, #9ca3af)'
  const fillColor = planned 
    ? 'var(--map-carpark-planned, #f3f4f6)' 
    : 'var(--map-carpark, #e5e7eb)'
  const strokeWidth = planned ? 2 : 1
  const dashArray = planned ? '6 4' : 'none'
  
  return (
    <g className={`map-carpark ${className}`}>
      <rect
        x={x} y={y} width={width} height={height}
        fill={fillColor}
        stroke={borderColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        rx="3"
      />
      {/* 停车位标记 */}
      {Array.from({ length: Math.floor(width / 20) }).map((_, i) => (
        <line
          key={i}
          x1={x + 15 + i * 20} y1={y + 5}
          x2={x + 15 + i * 20} y2={y + height - 5}
          stroke={borderColor}
          strokeWidth="0.5"
          opacity="0.5"
        />
      ))}
      {/* 标签 */}
      <text
        x={x + width / 2} y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9"
        fill="var(--on-surface, #1f2937)"
        fontWeight="500"
      >
        {label}
      </text>
    </g>
  )
}

// 建筑排组件
export function BuildingRow({ 
  x, y, 
  units = 5,
  unitWidth = 28,
  unitHeight = 18,
  gap = 3,
  className = '' 
}: { 
  x: number; y: number
  units?: number
  unitWidth?: number
  unitHeight?: number
  gap?: number
  className?: string 
}) {
  return (
    <g className={`map-building-row ${className}`}>
      {Array.from({ length: units }).map((_, i) => (
        <rect
          key={i}
          x={x + i * (unitWidth + gap)} y={y}
          width={unitWidth} height={unitHeight}
          fill="var(--map-building, #d1d5db)"
          stroke="var(--map-building-stroke, #9ca3af)"
          strokeWidth="0.5"
          rx="1"
        />
      ))}
    </g>
  )
}

// 教堂图标
export function ChurchIcon({ 
  x, y, 
  planned = false,
  size = 30,
  className = '' 
}: { 
  x: number; y: number
  planned?: boolean
  size?: number
  className?: string 
}) {
  const strokeColor = planned 
    ? 'var(--map-future, #6b7280)' 
    : 'var(--map-church, #374151)'
  const fillColor = planned 
    ? 'var(--map-church-planned, #e5e7eb)' 
    : 'var(--map-church-wall, #f3f4f6)'
  const strokeWidth = planned ? 2 : 1.5
  const dashArray = planned ? '6 4' : 'none'
  
  return (
    <g className={`map-church ${className}`} transform={`translate(${x}, ${y})`}>
      {/* 主体建筑 */}
      <rect
        x={-size / 2} y={-size / 3}
        width={size} height={size * 0.6}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        rx="2"
      />
      {/* 尖顶 */}
      <polygon
        points={`${-size / 4},-${size / 3} 0,${-size * 0.6} ${size / 4},-${size / 3}`}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />
      {/* 十字架 */}
      <line
        x1={0} y1={-size * 0.6}
        x2={0} y2={-size * 0.75}
        stroke={strokeColor}
        strokeWidth="2"
      />
      <line
        x1={-4} y1={-size * 0.68}
        x2={4} y2={-size * 0.68}
        stroke={strokeColor}
        strokeWidth="2"
      />
      {/* 门 */}
      <rect
        x={-4} y={size * 0.1}
        width={8} height={size * 0.17}
        fill={strokeColor}
        rx="4"
      />
      {/* 标签 */}
      <text
        x={0} y={size * 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8"
        fill="var(--on-surface, #1f2937)"
        fontWeight="500"
      >
        {planned ? 'Church (planned)' : 'Church'}
      </text>
    </g>
  )
}

// 步行路线组件
export function PlannedFootpath({ 
  path,
  className = '' 
}: { 
  path: string
  className?: string 
}) {
  return (
    <g className={`map-footpath ${className}`}>
      <path
        d={path}
        fill="none"
        stroke="var(--map-future, #6b7280)"
        strokeWidth="4"
        strokeDasharray="10 8"
        strokeLinecap="round"
      />
      {/* 标签 */}
      <text
        fontSize="9"
        fill="var(--map-future, #6b7280)"
        fontWeight="500"
      >
        <textPath href="#footpath-path" startOffset="50%" textAnchor="middle">
          Footpath (planned)
        </textPath>
      </text>
    </g>
  )
}

// 地图图例组件
export function MapLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`map-legend ${className}`}>
      <div className="map-legend-item">
        <span className="map-legend-line solid" />
        <span>Now</span>
      </div>
      <div className="map-legend-item">
        <span className="map-legend-line dashed" />
        <span>Future</span>
      </div>
    </div>
  )
}

// 地图面板容器
export function MapPanel({ 
  title, 
  children,
  className = '' 
}: { 
  title: string
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={`map-panel ${className}`}>
      <h4 className="map-panel-title">{title}</h4>
      <div className="map-panel-content">
        {children}
      </div>
    </div>
  )
}
