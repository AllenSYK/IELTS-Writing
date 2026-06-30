import type { Metadata } from 'next'
import { UserSessionProvider } from '@/components/auth/UserSessionProvider'
import { AppInteractionProvider } from '@/components/interaction-system'
import { AppRuntime } from '@/components/layout/AppRuntime'
import { BRAND_DESCRIPTION, BRAND_ICON_ALT, BRAND_NAME, BRAND_OG_IMAGE, BRAND_SHORT_NAME } from '@/lib/brand'
import './globals.css'
import './styles/web-audit-refactor.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.ieltswriting.online'),
  applicationName: BRAND_NAME,
  title: {
    default: BRAND_NAME,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  openGraph: {
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    siteName: BRAND_NAME,
    locale: 'zh_CN',
    type: 'website',
    images: [
      {
        url: BRAND_OG_IMAGE,
        width: 512,
        height: 512,
        alt: BRAND_ICON_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    images: [BRAND_OG_IMAGE],
  },
  appleWebApp: {
    title: BRAND_SHORT_NAME,
    capable: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <UserSessionProvider>
          <AppInteractionProvider>
            <AppRuntime>{children}</AppRuntime>
          </AppInteractionProvider>
        </UserSessionProvider>
      </body>
    </html>
  )
}
