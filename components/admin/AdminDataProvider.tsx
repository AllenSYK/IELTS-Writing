'use client'

import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'

export function AdminDataProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 30_000,
        keepPreviousData: true,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        shouldRetryOnError: false
      }}
    >
      {children}
    </SWRConfig>
  )
}
