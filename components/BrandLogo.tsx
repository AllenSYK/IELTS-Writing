'use client'

import Image from 'next/image'
import { useState } from 'react'
import {
  BRAND_ICON_ALT,
  BRAND_LOGO_SRC,
  BRAND_NAME,
  BRAND_SHORT_NAME
} from '@/lib/brand'

type BrandLogoSize = 'sm' | 'md' | 'lg'

type BrandLogoProps = {
  size?: BrandLogoSize
  showName?: boolean
  compact?: boolean
  stacked?: boolean
  className?: string
  priority?: boolean
  imageAlt?: string
}

const SizeConfig: Record<BrandLogoSize, { pixels: number; src: string; sizes: string }> = {
  sm: { pixels: 32, src: BRAND_LOGO_SRC, sizes: '32px' },
  md: { pixels: 40, src: BRAND_LOGO_SRC, sizes: '40px' },
  lg: { pixels: 76, src: '/brand/kongyumeng-logo-256.webp', sizes: '76px' }
}

export function BrandLogo({
  size = 'md',
  showName = true,
  compact = false,
  stacked = false,
  className = '',
  priority = false,
  imageAlt
}: BrandLogoProps) {
  const [logoFailed, setLogoFailed] = useState(false)
  const config = SizeConfig[size]
  const name = compact ? BRAND_SHORT_NAME : BRAND_NAME
  const resolvedAlt = imageAlt ?? (showName ? '' : BRAND_ICON_ALT)

  return (
    <span
      className={[
        'brand-logo',
        `brand-logo-${size}`,
        stacked ? 'brand-logo-stacked' : '',
        className
      ].filter(Boolean).join(' ')}
    >
      <span className="brand-logo-image-shell">
        {!logoFailed ? (
          <Image
            src={config.src}
            alt={resolvedAlt}
            width={config.pixels}
            height={config.pixels}
            sizes={config.sizes}
            priority={priority}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="brand-logo-fallback" aria-hidden={showName}>
            C
          </span>
        )}
      </span>
      {showName ? (
        <span className="brand-logo-text">
          <span className="brand-logo-name">{name}</span>
        </span>
      ) : (
        <span className="sr-only">{BRAND_NAME}</span>
      )}
    </span>
  )
}
