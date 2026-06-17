import { spawnSync } from 'node:child_process'
import path from 'node:path'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  const entitlements = path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist')
  const result = spawnSync('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', entitlements, appPath], {
    cwd: context.packager.projectDir,
    encoding: 'utf8'
  })

  if (result.status !== 0) {
    throw new Error(`Ad-hoc macOS signing failed: ${result.stderr || result.stdout}`)
  }
}
