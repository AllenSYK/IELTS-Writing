import type { Metadata } from 'next'
import { UserSessionProvider } from '@/components/auth/UserSessionProvider'
import { AppInteractionProvider } from '@/components/interaction-system'
import { AppRuntime } from '@/components/layout/AppRuntime'
import { BrandFaviconRefresher } from '@/components/layout/BrandFaviconRefresher'
import { SWRProvider } from '@/components/providers/SWRProvider'
import { InteractionOptimizer } from '@/components/providers/InteractionOptimizer'
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
  icons: {
    icon: [
      {
        url: '/brand/kongyumeng-tab-icon-20260725-v2.png',
        type: 'image/png',
        sizes: '64x64',
      },
      {
        url: '/brand/kongyumeng-app-icon-20260725.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    shortcut: {
      url: '/brand/kongyumeng-tab-icon-20260725-v2.png',
      type: 'image/png',
    },
    apple: {
      url: '/brand/kongyumeng-apple-icon-20260725.png',
      type: 'image/png',
      sizes: '180x180',
    },
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
        <InteractionOptimizer />
        <BrandFaviconRefresher />
        <SWRProvider>
          <UserSessionProvider>
            <AppInteractionProvider>
              <AppRuntime>{children}</AppRuntime>
            </AppInteractionProvider>
          </UserSessionProvider>
        </SWRProvider>
      </body>
    </html>
  )
}
