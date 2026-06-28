'use client'

import { 
  RiverShape, 
  BridgeShape, 
  HouseIcon, 
  CarParkBlock, 
  BuildingRow, 
  ChurchIcon 
} from './MapElements'

/**
 * Now and Future 地图组件
 * 
 * 布局：
 * - 河流：与左图相同位置
 * - 公路桥：东西向道路横穿河流
 * - 停车场：西北侧两个
 * - 建筑排：停车场附近
 * - 住宅区：北侧和南侧
 * - 步行路线：未来规划，虚线
 * - 教堂：未来规划
 * - 停车场：未来规划
 */

export function MapNowFuture({ className = '' }: { className?: string }) {
  // 河流路径 - 与1968年保持一致
  const riverPath = 'M220 0 C205 80 235 150 215 240 C200 320 230 400 215 480 L310 480 C325 390 300 310 320 225 C340 140 310 70 325 0 Z'

  // 步行路线路径 - 从西南向东南斜向穿过河流
  const footpathPath = 'M15 330 C100 350 200 370 350 380 C400 385 450 390 500 390'

  return (
    <svg
      viewBox="0 0 520 480"
      className={`map-svg ${className}`}
      role="img"
      aria-labelledby="map-now-future-title map-now-future-desc"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id="map-now-future-title">Now and Future</title>
      <desc id="map-now-future-desc">
        Map showing the river crossing area with current developments and future plans, 
        including a road bridge crossing the river, car parks, buildings, housing areas, 
        a planned footpath, church, and future car park.
      </desc>

      {/* 背景 */}
      <rect x="0" y="0" width="520" height="480" fill="var(--map-bg, #ffffff)" rx="8" />

      {/* 河流 - 与左图相同位置 */}
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

      {/* 公路桥 - 东西向道路横穿河流 */}
      <g className="road-bridge">
        {/* 道路 - 左侧 */}
        <line
          x1={0} y1={235}
          x2={220} y2={235}
          stroke="var(--map-road, #4b5563)"
          strokeWidth="4"
        />
        {/* 桥梁 */}
        <BridgeShape x={220} y={228} width={90} height={14} />
        {/* 道路 - 右侧 */}
        <line
          x1={310} y1={235}
          x2={520} y2={235}
          stroke="var(--map-road, #4b5563)"
          strokeWidth="4"
        />
        {/* 道路标签 */}
        <text
          x={50} y={225}
          fontSize="11"
          fill="var(--on-surface, #1f2937)"
          fontWeight="500"
        >
          City →
        </text>
        {/* 桥梁标签 */}
        <text
          x={265} y={220}
          textAnchor="middle"
          fontSize="9"
          fill="var(--on-surface, #1f2937)"
          fontWeight="500"
        >
          Bridge
        </text>
      </g>

      {/* 西北侧停车场 */}
      <g className="car-parks-north">
        {/* 较小的停车场 */}
        <CarParkBlock
          x={25} y={40}
          width={90} height={70}
          label="Car park"
        />
        {/* 较大的停车场 */}
        <CarParkBlock
          x={25} y={135}
          width={145} height={85}
          label="Car park"
        />
      </g>

      {/* 西北侧建筑排 */}
      <g className="buildings-north">
        <BuildingRow x={120} y={45} units={5} />
        <BuildingRow x={120} y={82} units={5} />
        <BuildingRow x={120} y={119} units={5} />
        {/* 建筑标签 */}
        <text
          x={195} y={155}
          textAnchor="middle"
          fontSize="10"
          fill="var(--on-surface, #1f2937)"
          fontWeight="500"
        >
          Buildings
        </text>
      </g>

      {/* 东侧住宅区 - 道路北侧 */}
      <g className="housing-north">
        <HouseIcon x={365} y={55} size={20} />
        <HouseIcon x={405} y={55} size={20} />
        <HouseIcon x={445} y={55} size={20} />
        <HouseIcon x={365} y={95} size={20} />
        <HouseIcon x={405} y={95} size={20} />
        <HouseIcon x={445} y={95} size={20} />
        <HouseIcon x={365} y={135} size={20} />
        <HouseIcon x={405} y={135} size={20} />
        <HouseIcon x={445} y={135} size={20} />
        {/* 住宅标签 */}
        <text
          x={405} y={175}
          textAnchor="middle"
          fontSize="10"
          fill="var(--on-surface, #1f2937)"
          fontWeight="500"
        >
          Housing
        </text>
      </g>

      {/* 道路南侧新增住宅 */}
      <g className="housing-south">
        <HouseIcon x={375} y={270} size={18} />
        <HouseIcon x={410} y={270} size={18} />
        <HouseIcon x={445} y={270} size={18} />
        <HouseIcon x={375} y={305} size={18} />
        <HouseIcon x={410} y={305} size={18} />
        <HouseIcon x={445} y={305} size={18} />
        {/* 住宅标签 */}
        <text
          x={410} y={340}
          textAnchor="middle"
          fontSize="10"
          fill="var(--on-surface, #1f2937)"
          fontWeight="500"
        >
          New housing
        </text>
      </g>

      {/* 未来步行路线 - 虚线 */}
      <g className="footpath-planned">
        <path
          id="footpath-path"
          d={footpathPath}
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
          <textPath href="#footpath-path" startOffset="30%" textAnchor="middle">
            Footpath (planned)
          </textPath>
        </text>
      </g>

      {/* 规划教堂 - 河流东南侧 */}
      <ChurchIcon
        x={335} y={380}
        planned={true}
        size={35}
      />

      {/* 规划停车场 - 教堂附近 */}
      <CarParkBlock
        x={410} y={360}
        width={95} height={65}
        planned={true}
        label="Car park (planned)"
      />

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
