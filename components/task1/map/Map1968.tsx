'use client'

import { RiverShape, RoadShape, TreeIcon, HouseIcon } from './MapElements'

/**
 * 1968年地图组件
 * 
 * 布局：
 * - 河流：中间偏右，纵向，宽区域
 * - 道路：从左侧水平进入，指向河边
 * - 森林：西北侧，道路上方
 * - 住宅区：河流东北侧
 * - 码头：道路尽头河边
 */

export function Map1968({ className = '' }: { className?: string }) {
  // 河流路径 - 宽的纵向区域，从顶部到底部，略有自然弯曲
  const riverPath = 'M220 0 C205 80 235 150 215 240 C200 320 230 400 215 480 L310 480 C325 390 300 310 320 225 C340 140 310 70 325 0 Z'

  return (
    <svg
      viewBox="0 0 520 480"
      className={`map-svg ${className}`}
      role="img"
      aria-labelledby="map-1968-title map-1968-desc"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id="map-1968-title">1968</title>
      <desc id="map-1968-desc">
        Map showing the river crossing area in 1968, with a river running north to south, 
        a road from the city stopping at the riverbank, forest in the northwest, 
        and housing area northeast of the river.
      </desc>

      {/* 背景 */}
      <rect x="0" y="0" width="520" height="480" fill="var(--map-bg, #ffffff)" rx="8" />

      {/* 森林区域 - 西北侧，道路上方 */}
      <g className="forest-area">
        {/* 多棵树木组成森林 */}
        <TreeIcon x={30} y={50} size={18} />
        <TreeIcon x={65} y={42} size={20} />
        <TreeIcon x={95} y={65} size={16} />
        <TreeIcon x={45} y={90} size={18} />
        <TreeIcon x={85} y={105} size={20} />
        <TreeIcon x={120} y={55} size={17} />
        <TreeIcon x={55} y={120} size={19} />
        <TreeIcon x={100} y={85} size={16} />
        {/* 森林标签 */}
        <text
          x={75} y={145}
          textAnchor="middle"
          fontSize="12"
          fill="var(--on-surface, #1f2937)"
          fontWeight="600"
        >
          Forest
        </text>
      </g>

      {/* 河流 - 宽的纵向区域 */}
      <RiverShape path={riverPath} />

      {/* 河流标签 */}
      <text
        x={267} y={240}
        textAnchor="middle"
        fontSize="12"
        fill="var(--map-river-text, #4b5563)"
        fontWeight="600"
        transform="rotate(-90, 267, 240)"
      >
        River
      </text>

      {/* 城市道路 - 从左侧水平进入，指向河边 */}
      <RoadShape x1={0} y1={250} x2={220} y2={250} />

      {/* 道路标签 */}
      <text
        x={50} y={240}
        fontSize="11"
        fill="var(--on-surface, #1f2937)"
        fontWeight="500"
      >
        City →
      </text>

      {/* 码头/渡口设施 - 道路尽头河边 */}
      <g className="ferry-facility">
        <rect
          x={205} y={240}
          width={25} height={30}
          fill="var(--map-ferry, #9ca3af)"
          stroke="var(--map-ferry-stroke, #6b7280)"
          strokeWidth="1.5"
          rx="2"
        />
        {/* 码头标记 */}
        <line
          x1={210} y1={245}
          x2={210} y2={265}
          stroke="var(--map-ferry-stroke, #6b7280)"
          strokeWidth="1"
        />
        <line
          x1={220} y1={245}
          x2={220} y2={265}
          stroke="var(--map-ferry-stroke, #6b7280)"
          strokeWidth="1"
        />
        <line
          x1={225} y1={245}
          x2={225} y2={265}
          stroke="var(--map-ferry-stroke, #6b7280)"
          strokeWidth="1"
        />
        {/* 标签 */}
        <text
          x={217} y={285}
          textAnchor="middle"
          fontSize="9"
          fill="var(--on-surface, #1f2937)"
          fontWeight="500"
        >
          Ferry
        </text>
      </g>

      {/* 住宅区 - 河流东北侧 */}
      <g className="housing-area">
        {/* 多栋房屋形成住宅区 */}
        <HouseIcon x={350} y={55} size={22} />
        <HouseIcon x={395} y={55} size={22} />
        <HouseIcon x={440} y={55} size={22} />
        <HouseIcon x={350} y={100} size={22} />
        <HouseIcon x={395} y={100} size={22} />
        <HouseIcon x={440} y={100} size={22} />
        <HouseIcon x={350} y={145} size={22} />
        <HouseIcon x={395} y={145} size={22} />
        {/* 住宅区标签 */}
        <text
          x={395} y={185}
          textAnchor="middle"
          fontSize="12"
          fill="var(--on-surface, #1f2937)"
          fontWeight="600"
        >
          Housing area
        </text>
      </g>

      {/* 边框 */}
      <rect
        x="0" y="0" width="520" height="480"
        fill="none"
        stroke="var(--map-border, #e5e7eb)"
        strokeWidth="1"
        rx="8"
      />
    </svg>
  )
}
