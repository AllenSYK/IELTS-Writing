'use client'

import { useEffect } from 'react'

const TAB_ICON_PATH = '/brand/kongyumeng-tab-icon-20260725-v2.png'

export function BrandFaviconRefresher() {
  useEffect(() => {
    const iconHref = `${TAB_ICON_PATH}?safari-refresh=${Date.now().toString(36)}`

    const refreshIcon = () => {
      document.head
        .querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
        .forEach((link) => link.remove())

      const icon = document.createElement('link')
      icon.rel = 'icon'
      icon.type = 'image/png'
      icon.sizes = '64x64'
      icon.href = iconHref
      document.head.appendChild(icon)

      const shortcut = document.createElement('link')
      shortcut.rel = 'shortcut icon'
      shortcut.type = 'image/png'
      shortcut.href = iconHref
      document.head.appendChild(shortcut)
    }

    refreshIcon()
    const settleTimer = window.setTimeout(refreshIcon, 250)

    return () => window.clearTimeout(settleTimer)
  }, [])

  return null
}
