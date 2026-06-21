export const emailBrand = {
  productName: 'IELTS Writing',
  logoUrl: 'https://www.ieltswriting.online/logo.svg',
  websiteUrl: 'https://www.ieltswriting.online',
  supportEmail: 'qgyxzq@gmail.com',
  primaryColor: '#0a66ff',
  accentColor: '#12b981',
  fromName: process.env.EMAIL_FROM_NAME?.trim() || 'IELTS Writing',
  fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim() || 'noreply@ieltswriting.online',
  copyrightText: `© ${new Date().getFullYear()} IELTS Writing. All rights reserved.`
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || emailBrand.websiteUrl
}

export function getEmailFrom() {
  const safeName = emailBrand.fromName.replace(/[<>"]/g, '').trim() || emailBrand.productName
  return `${safeName} <${emailBrand.fromAddress}>`
}
