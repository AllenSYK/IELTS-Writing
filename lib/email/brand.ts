import { BRAND_NAME } from '@/lib/brand'

const ProductionSiteUrl = 'https://www.ieltswriting.online'
const DefaultSiteUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ProductionSiteUrl
const SiteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || DefaultSiteUrl).replace(/\/$/, '')

export const emailBrand = {
  productName: BRAND_NAME,
  logoUrl: `${SiteUrl}/brand/kongyumeng-logo.png`,
  websiteUrl: SiteUrl,
  supportEmail: 'qgyxzq@gmail.com',
  primaryColor: '#0a66ff',
  accentColor: '#12b981',
  fromName: process.env.EMAIL_FROM_NAME?.trim() || BRAND_NAME,
  fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim() || 'noreply@ieltswriting.online',
  copyrightText: `© ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`
}

export function getSiteUrl() {
  return SiteUrl
}

export function getEmailFrom() {
  const safeName = emailBrand.fromName.replace(/[<>"]/g, '').trim() || emailBrand.productName
  return `${safeName} <${emailBrand.fromAddress}>`
}
