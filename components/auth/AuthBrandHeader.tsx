import { BrandLogo } from '@/components/BrandLogo'
import { BRAND_TAGLINE } from '@/lib/brand'

export function AuthBrandHeader({ subtitle = BRAND_TAGLINE }: { subtitle?: string }) {
  return (
    <div className="auth-brand-block">
      <BrandLogo size="lg" showName stacked priority />
      <p>{subtitle}</p>
    </div>
  )
}
