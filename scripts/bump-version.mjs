import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`)
}

function bumpPatch(version) {
  const parts = version.split('.').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid semver version: ${version}`)
  }
  parts[2] += 1
  return parts.join('.')
}

function replaceLineOrAppend(file, key, value) {
  const fullPath = path.join(root, file)
  if (!fs.existsSync(fullPath)) return false
  const raw = fs.readFileSync(fullPath, 'utf8')
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  const next = pattern.test(raw) ? raw.replace(pattern, line) : `${raw.trimEnd()}\n${line}\n`
  if (next !== raw) fs.writeFileSync(fullPath, next)
  return true
}

function replaceInFile(file, replacements) {
  const fullPath = path.join(root, file)
  if (!fs.existsSync(fullPath)) return false
  let raw = fs.readFileSync(fullPath, 'utf8')
  let next = raw
  for (const [from, to] of replacements) {
    next = next.replace(from, to)
  }
  if (next !== raw) fs.writeFileSync(fullPath, next)
  return next !== raw
}

function updatePlist(appPath, version) {
  const plist = path.join(root, appPath, 'Contents', 'Info.plist')
  if (!fs.existsSync(plist)) return false
  let raw = fs.readFileSync(plist, 'utf8')
  let seenShort = false
  let seenBundle = false
  raw = raw.replace(/<key>CFBundleShortVersionString<\/key>\s*<string>[^<]+<\/string>/, () => {
    seenShort = true
    return `<key>CFBundleShortVersionString</key>\n    <string>${version}</string>`
  })
  raw = raw.replace(/<key>CFBundleVersion<\/key>\s*<string>[^<]+<\/string>/, () => {
    seenBundle = true
    return `<key>CFBundleVersion</key>\n    <string>${version}</string>`
  })
  if (!seenShort || !seenBundle) throw new Error(`Unable to update Info.plist version fields in ${plist}`)
  fs.writeFileSync(plist, raw)
  return true
}

const packageJson = readJson('package.json')
const oldVersion = packageJson.version
const newVersion = process.argv[2] || bumpPatch(oldVersion)

packageJson.version = newVersion
packageJson.scripts = {
  ...packageJson.scripts,
  'version:bump': 'node scripts/bump-version.mjs'
}
writeJson('package.json', packageJson)

const lock = readJson('package-lock.json')
lock.version = newVersion
if (lock.packages?.['']) lock.packages[''].version = newVersion
writeJson('package-lock.json', lock)

replaceLineOrAppend('.env.example', 'NEXT_PUBLIC_APP_VERSION', newVersion)
replaceLineOrAppend('.env.local', 'NEXT_PUBLIC_APP_VERSION', newVersion)

replaceInFile('app/admin/page.tsx', [
  [/version=\{process\.env\.NEXT_PUBLIC_APP_VERSION \|\| '[^']+'\}/, `version={process.env.NEXT_PUBLIC_APP_VERSION || '${newVersion}'}`],
  [/version: '[0-9]+\.[0-9]+\.[0-9]+'/g, `version: '${newVersion}'`],
  [/placeholder="例如 [0-9]+\.[0-9]+\.[0-9]+"/g, `placeholder="例如 ${newVersion}"`]
])

replaceInFile('scripts/release-mac.mjs', [
  [/Usage: npm run release:mac -- [0-9]+\.[0-9]+\.[0-9]+/g, `Usage: npm run release:mac -- ${newVersion}`]
])

replaceInFile('electron/activation/index.html', [
  [/v1\.0\.0/g, `v${newVersion}`],
  [/'1\.0\.0'/g, `'${newVersion}'`]
])

updatePlist('IELTS Writing.app', newVersion)

console.log(`版本已从 ${oldVersion} 更新到 ${newVersion}`)
