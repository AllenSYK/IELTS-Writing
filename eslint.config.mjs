import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['release/**', '.next/**', 'supabase/functions/**', 'supabase/.temp/**', 'electron/**']
  }
]

export default eslintConfig
