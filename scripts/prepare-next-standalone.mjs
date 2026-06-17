import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const standalone = join(root, '.next', 'standalone')
const staticDir = join(root, '.next', 'static')
const standaloneStatic = join(standalone, '.next', 'static')
const publicDir = join(root, 'public')
const standalonePublic = join(standalone, 'public')
const forbiddenEnvFiles = ['.env', '.env.local', '.env.production', '.env.release.local']

if (existsSync(standalone)) {
  for (const file of forbiddenEnvFiles) {
    rmSync(join(standalone, file), { force: true })
  }
  if (existsSync(staticDir)) {
    mkdirSync(dirname(standaloneStatic), { recursive: true })
    cpSync(staticDir, standaloneStatic, { recursive: true })
  }
  if (existsSync(publicDir)) {
    cpSync(publicDir, standalonePublic, { recursive: true })
  }
}
