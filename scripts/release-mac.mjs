import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import dotenv from 'dotenv'
import {
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { NodeHttpHandler } from '@smithy/node-http-handler'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(root, '.env.release.local'), quiet: true })

process.on('unhandledRejection', (error) => {
  fail(error instanceof Error ? error.message : String(error))
})

const args = process.argv.slice(2)
const cleanupR2 = args.includes('--cleanup-r2')
const version = args.find((arg) => !arg.startsWith('--'))
const retry = args.includes('--retry')
const mandatory = args.includes('--mandatory')
const notes = readFlag('--notes') || process.env.RELEASE_NOTES || `Release ${version}`
const channel = readFlag('--channel') || process.env.RELEASE_CHANNEL || 'stable'
const architecture = readFlag('--arch') || process.env.RELEASE_ARCHITECTURE || 'arm64'
const platform = 'darwin'
const storageProvider = (process.env.RELEASE_STORAGE_PROVIDER || 'r2').toLowerCase()
const uploadTimeoutMs = Number(process.env.RELEASE_UPLOAD_TIMEOUT_MS || 30 * 60 * 1000)
const uploadPartSize = 16 * 1024 * 1024
const uploadQueueSize = 1
const uploadAttempts = 5
const r2MaxAttempts = 5
const r2ConnectionTimeoutMs = 30 * 1000
const r2RequestTimeoutMs = 15 * 60 * 1000
const adminActionTimeoutMs = 30 * 1000
const adminActionAttempts = 5
const cleanupR2Prefix = readFlag('--cleanup-prefix') || process.env.RELEASE_CLEANUP_PREFIX || (version ? `${channel}/${platform}/${architecture}/${version}/` : '')

if (cleanupR2) {
  if (!cleanupR2Prefix) {
    fail('Pass a version or --cleanup-prefix when using --cleanup-r2.')
  }
  if (storageProvider !== 'r2') {
    fail('RELEASE_STORAGE_PROVIDER must be r2 to clean up R2 multipart uploads.')
  }
  requireEnv([
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME'
  ])
  await cleanupR2MultipartUploads()
  process.exit(0)
}

if (!version || !semver.valid(version)) {
  fail('Usage: npm run release:mac -- 1.0.3 [--retry] [--notes "release notes"] [--mandatory]')
}
if (!['stable', 'beta'].includes(channel)) {
  fail('Release channel must be stable or beta.')
}
if (storageProvider !== 'r2') {
  fail('RELEASE_STORAGE_PROVIDER must be r2 for large macOS update packages.')
}

requireEnv([
  'ADMIN_LICENSE_FUNCTION_URL',
  'ADMIN_EDGE_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL'
])

const packagePath = path.join(root, 'package.json')
const packageJson = JSON.parse(await fsp.readFile(packagePath, 'utf8'))
if (!retry && !semver.gt(version, packageJson.version)) {
  fail(`Version ${version} must be higher than current version ${packageJson.version}. Use --retry to republish existing ${packageJson.version} artifacts.`)
}
if (retry && version !== packageJson.version) {
  fail(`--retry can only republish the current package version (${packageJson.version}). Requested ${version}.`)
}

if (!retry) {
  await ensureCleanGit()
  await run('npm', ['version', version, '--no-git-tag-version'])
}

let artifacts = await tryFindArtifacts(version)
if (!artifacts || !retry) {
  if (retry) {
    console.log(`Existing ${version} artifact set is incomplete. Rebuilding missing release files...`)
  }
  await run('npm', ['run', 'typecheck'])
  await run('npm', ['run', 'build'])
  await run('npx', ['electron-builder', '--mac', 'dmg', 'zip', '--arm64', '--publish', 'never'])
  artifacts = await tryFindArtifacts(version)
}
if (!artifacts) fail(`Missing release artifacts for ${version}.`)

const prepared = orderArtifactsForUpload(await prepareArtifactsForR2(artifacts, version))
const hashes = Object.fromEntries(await Promise.all(prepared.map(async (artifact) => [artifact.kind, await sha512(artifact.file)])))
const metadataSha = await readMetadataSha(prepared.find((artifact) => artifact.kind === 'metadata')?.file, hashes.zip?.base64)
const r2 = createR2Client()

await saveReleaseRecord('draft', {
  version,
  channel,
  platform,
  architecture,
  releaseNotes: notes,
  mandatory,
  minimumSupportedVersion: process.env.MINIMUM_SUPPORTED_VERSION || null,
  published: false
})

const uploads = []
try {
  for (const artifact of prepared) {
    await uploadWithRetries(r2, artifact)
    const publicUrl = publicObjectUrl(process.env.R2_PUBLIC_BASE_URL, artifact.storageKey)
    await verifyPublicUrl(artifact, publicUrl)
    uploads.push({ ...artifact, publicUrl, sha512: hashes[artifact.kind] })
  }
} catch (error) {
  await markReleaseFailed(error)
  fail(error instanceof Error ? error.message : 'R2 upload failed.')
}

const zip = uploads.find((artifact) => artifact.kind === 'zip')
const dmg = uploads.find((artifact) => artifact.kind === 'dmg')
const metadata = uploads.find((artifact) => artifact.kind === 'metadata')
if (!zip || !dmg || !metadata) {
  await markReleaseFailed(new Error('Release upload set is incomplete.'))
  fail('Release upload set is incomplete.')
}

const publish = await saveReleaseRecord('published', {
  version,
  channel,
  platform,
  architecture,
  releaseNotes: notes,
  mandatory,
  minimumSupportedVersion: process.env.MINIMUM_SUPPORTED_VERSION || null,
  downloadUrl: zip.publicUrl,
  metadataUrl: metadata.publicUrl,
  sha512: metadataSha,
  fileSize: zip.size,
  published: true,
  storageProvider: 'r2',
  artifacts: uploads.map((artifact) => ({
    kind: artifact.kind,
    key: artifact.storageKey,
    publicUrl: artifact.publicUrl,
    size: artifact.size,
    sha512: artifact.sha512?.base64 || null
  }))
})

console.log('')
console.log('Release published')
console.log(`Version: ${version}`)
console.log(`Channel: ${channel}`)
console.log(`Architecture: ${architecture}`)
console.log(`DMG: ${dmg.file}`)
console.log(`ZIP: ${zip.file}`)
console.log(`Metadata: ${metadata.file}`)
console.log(`Download URL: ${zip.publicUrl}`)
console.log(`Metadata URL: ${metadata.publicUrl}`)
console.log(`SHA-512: ${metadataSha}`)
console.log(`Release status: ${publish.release?.status || (publish.release?.published ? 'published' : 'draft')}`)
console.log(`Database record ID: ${publish.release?.id || 'not returned'}`)

function readFlag(name) {
  const index = args.indexOf(name)
  if (index === -1) return ''
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : ''
}

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    fail(`Missing required .env.release.local variables: ${missing.join(', ')}. Configure Cloudflare R2 credentials locally; they must not be committed or bundled.`)
  }
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: 'inherit', shell: false })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${code}.`))
    })
    child.on('error', reject)
  })
}

async function ensureCleanGit() {
  const status = await capture('git', ['status', '--porcelain'])
  if (status.trim()) {
    fail('Git working tree is not clean. Commit or stash changes before releasing.')
  }
}

function capture(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `${command} failed.`))
    })
    child.on('error', reject)
  })
}

async function tryFindArtifacts(releaseVersion) {
  const releaseDir = path.join(root, 'release')
  const files = await fsp.readdir(releaseDir).catch(() => [])
  const stats = await Promise.all(files.map(async (file) => {
    const fullPath = path.join(releaseDir, file)
    return { file: fullPath, stat: await fsp.stat(fullPath) }
  }))
  const regular = stats.filter((item) => item.stat.isFile()).map((item) => item.file)
  const byKind = [
    { kind: 'dmg', match: (file) => file.endsWith('.dmg') && file.includes(releaseVersion) && file.includes(architecture) },
    { kind: 'zip', match: (file) => file.endsWith('.zip') && file.includes(releaseVersion) && file.toLowerCase().includes('mac') },
    { kind: 'metadata', match: (file) => path.basename(file) === 'latest-mac.yml' },
    { kind: 'dmgBlockmap', match: (file) => file.endsWith('.dmg.blockmap') && file.includes(releaseVersion) },
    { kind: 'zipBlockmap', match: (file) => file.endsWith('.zip.blockmap') && file.includes(releaseVersion) }
  ]
  const artifacts = []
  for (const { kind, match } of byKind) {
    const file = regular.find(match)
    if (!file) return null
    artifacts.push({ kind, file, size: fs.statSync(file).size, contentType: contentType(file) })
  }
  return artifacts
}

async function prepareArtifactsForR2(artifacts, releaseVersion) {
  const prefix = `${channel}/${platform}/${architecture}`
  const tempDir = path.join(root, '.release-tmp')
  await fsp.mkdir(tempDir, { recursive: true })

  const zip = artifacts.find((artifact) => artifact.kind === 'zip')
  const dmg = artifacts.find((artifact) => artifact.kind === 'dmg')
  const metadata = artifacts.find((artifact) => artifact.kind === 'metadata')
  if (!zip || !dmg || !metadata) fail('Release artifact set must include dmg, zip, and latest-mac.yml.')

  const metadataFile = path.join(tempDir, `latest-mac-${releaseVersion}-${Date.now()}.yml`)
  const rewrittenMetadata = rewriteLatestMacYml(await fsp.readFile(metadata.file, 'utf8'), releaseVersion, [zip.file, dmg.file])
  await fsp.writeFile(metadataFile, rewrittenMetadata, 'utf8')

  return artifacts.map((artifact) => {
    if (artifact.kind === 'metadata') {
      return {
        ...artifact,
        file: metadataFile,
        size: Buffer.byteLength(rewrittenMetadata),
        contentType: contentType(metadataFile),
        storageKey: `${prefix}/latest-mac.yml`
      }
    }
    return {
      ...artifact,
      storageKey: `${prefix}/${releaseVersion}/${path.basename(artifact.file)}`
    }
  })
}

function orderArtifactsForUpload(artifacts) {
  const uploadOrder = ['dmg', 'zip', 'metadata', 'dmgBlockmap', 'zipBlockmap']
  return uploadOrder.map((kind) => {
    const artifact = artifacts.find((item) => item.kind === kind)
    if (!artifact) fail(`Release artifact set is missing ${kind}.`)
    return artifact
  })
}

function rewriteLatestMacYml(text, releaseVersion, files) {
  let output = text
  for (const file of files) {
    const filename = path.basename(file)
    output = output.replaceAll(`url: ${filename}`, `url: ${releaseVersion}/${filename}`)
    output = output.replaceAll(`path: ${filename}`, `path: ${releaseVersion}/${filename}`)
  }
  return output
}

async function readMetadataSha(file, fallback) {
  if (!file) return fallback || ''
  const ymlText = await fsp.readFile(file, 'utf8')
  return ymlText.match(/sha512:\s*([^\s]+)/)?.[1] || fallback || ''
}

async function sha512(file) {
  const hash = crypto.createHash('sha512')
  await new Promise((resolve, reject) => {
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve)
  })
  const digest = hash.digest()
  return { hex: digest.toString('hex'), base64: digest.toString('base64') }
}

function createR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    forcePathStyle: true,
    maxAttempts: r2MaxAttempts,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: r2ConnectionTimeoutMs,
      requestTimeout: r2RequestTimeoutMs
    })
  })
}

async function uploadWithRetries(client, artifact) {
  await withRetries(async (attempt) => {
    await uploadR2Object(client, artifact, attempt)
  }, uploadAttempts, `upload ${path.basename(artifact.file)}`)
}

async function uploadR2Object(client, artifact, attempt) {
  const fileName = path.basename(artifact.file)
  let stage = 'checking existing object'
  let upload = null
  try {
    logFileStage(artifact, stage, `attempt ${attempt}/${uploadAttempts}`)
    const existing = await headR2Object(client, artifact)
    if (existing.exists && existing.size === artifact.size) {
      console.log(`  ${artifact.kind}: existing object size matches ${formatBytes(existing.size)}; skipping upload.`)
      stage = 'uploading parts'
      logFileStage(artifact, stage, 'skipped; existing object already verified')
      stage = 'completing multipart upload'
      logFileStage(artifact, stage, 'skipped; no new multipart upload')
      stage = 'verifying with HeadObject'
      logFileStage(artifact, stage)
      verifyHeadObjectSize(artifact, existing.size)
      return { skipped: true }
    }
    if (existing.exists) {
      console.warn(`  ${artifact.kind}: existing object size mismatch; local ${artifact.size}, remote ${existing.size}. Re-uploading.`)
    } else {
      console.log(`  ${artifact.kind}: no complete object found; upload required.`)
    }

    stage = 'uploading parts'
    logFileStage(artifact, stage)
    upload = new Upload({
      client,
      queueSize: uploadQueueSize,
      partSize: uploadPartSize,
      leavePartsOnError: false,
      params: {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: artifact.storageKey,
        Body: fs.createReadStream(artifact.file),
        ContentType: artifact.contentType,
        CacheControl: artifact.kind === 'metadata' ? 'no-cache' : 'public, max-age=31536000, immutable'
      }
    })

    let lastLoggedPercent = -1
    let completingLogged = false
    const logCompleting = () => {
      if (completingLogged) return
      completingLogged = true
      stage = 'completing multipart upload'
      logFileStage(artifact, stage)
      console.log(`  ${artifact.kind}: 100% transferred; waiting for Upload.done() to resolve.`)
    }
    upload.on('httpUploadProgress', (progress) => {
      if (!progress.total) return
      const loaded = Number(progress.loaded || 0)
      const total = Number(progress.total)
      const percent = Math.floor((loaded / total) * 100)
      if (percent >= lastLoggedPercent + 10 || percent === 100) {
        lastLoggedPercent = percent
        console.log(`  ${artifact.kind}: ${percent}%`)
      }
      if (loaded >= total) {
        logCompleting()
      }
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      void upload.abort()
    }, uploadTimeoutMs)
    try {
      await upload.done()
      if (!completingLogged) {
        stage = 'completing multipart upload'
        logFileStage(artifact, stage)
      }
      console.log(`  ${artifact.kind}: Upload.done() resolved.`)
    } catch (error) {
      if (timedOut) {
        throw new Error(`Upload timed out after ${Math.round(uploadTimeoutMs / 1000)} seconds.`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    stage = 'verifying with HeadObject'
    logFileStage(artifact, stage)
    await requireMatchingHeadObject(client, artifact)
    return { skipped: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`${fileName}: failed during ${stage}: ${message}`)
    try {
      await abortAndCleanupMultipartUpload(client, artifact, upload)
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      console.warn(`${fileName}: multipart cleanup failed: ${cleanupMessage}`)
    }
    throw new Error(`R2 upload failed for ${fileName} during ${stage}: ${message}`)
  }
}

function logFileStage(artifact, stage, suffix = '') {
  const fileName = path.basename(artifact.file)
  console.log(`${fileName}: ${stage}${suffix ? ` (${suffix})` : ''}`)
}

async function headR2Object(client, artifact) {
  try {
    const head = await client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: artifact.storageKey
    }))
    return {
      exists: true,
      size: Number(head.ContentLength || 0),
      head
    }
  } catch (error) {
    if (isR2NotFound(error)) {
      return { exists: false, size: 0, head: null }
    }
    throw error
  }
}

async function requireMatchingHeadObject(client, artifact) {
  const result = await headR2Object(client, artifact)
  if (!result.exists) {
    throw new Error(`R2 verification failed for ${artifact.storageKey}: object does not exist after upload.`)
  }
  verifyHeadObjectSize(artifact, result.size)
  return result.head
}

function verifyHeadObjectSize(artifact, remoteSize) {
  if (remoteSize !== artifact.size) {
    throw new Error(`R2 size verification failed for ${artifact.storageKey}: local ${artifact.size}, remote ${remoteSize}.`)
  }
}

function isR2NotFound(error) {
  return error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404
}

async function abortAndCleanupMultipartUpload(client, artifact, upload) {
  if (upload) {
    try {
      await upload.abort()
      console.warn(`  ${artifact.kind}: abort requested for active multipart upload.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`  ${artifact.kind}: active multipart abort returned: ${message}`)
    }
  }
  const aborted = await cleanupMultipartUploadsForKey(client, artifact.storageKey)
  if (aborted > 0) {
    console.warn(`  ${artifact.kind}: cleaned up ${aborted} unfinished multipart upload(s).`)
  }
}

async function cleanupMultipartUploadsForKey(client, key) {
  return cleanupMultipartUploadsForPrefix(client, key, { exactKey: key, quiet: true })
}

async function cleanupR2MultipartUploads() {
  const client = createR2Client()
  console.log(`Cleaning unfinished R2 multipart uploads under prefix: ${cleanupR2Prefix}`)
  const aborted = await cleanupMultipartUploadsForPrefix(client, cleanupR2Prefix)
  console.log(`Cleanup complete. Aborted ${aborted} unfinished multipart upload(s). Completed objects were not deleted.`)
}

async function cleanupMultipartUploadsForPrefix(client, prefix, options = {}) {
  let aborted = 0
  let inspected = 0
  let keyMarker
  let uploadIdMarker

  do {
    const response = await client.send(new ListMultipartUploadsCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: prefix,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker
    }))
    const uploads = response.Uploads || []
    for (const multipart of uploads) {
      if (!multipart.Key || !multipart.UploadId) continue
      if (options.exactKey && multipart.Key !== options.exactKey) continue
      inspected += 1
      console.log(`[cleanup] aborting multipart upload: ${multipart.Key}`)
      await client.send(new AbortMultipartUploadCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: multipart.Key,
        UploadId: multipart.UploadId
      }))
      aborted += 1
    }
    keyMarker = response.NextKeyMarker
    uploadIdMarker = response.NextUploadIdMarker
  } while (keyMarker || uploadIdMarker)

  if (!options.quiet || aborted > 0) {
    console.log(`[cleanup] inspected ${inspected} unfinished multipart upload(s), aborted ${aborted}.`)
  }
  return aborted
}

async function withRetries(fn, attempts, label) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const delayMs = 1000 * attempt * attempt
      console.warn(`${label} failed on attempt ${attempt}; retrying in ${delayMs}ms.`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

async function verifyPublicUrl(artifact, url) {
  logFileStage(artifact, 'checking public URL')
  const response = await fetch(url, { method: 'HEAD' })
  if (response.ok) return
  const fallback = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
  if (!fallback.ok) {
    throw new Error(`Public URL verification failed: HTTP ${fallback.status} for ${url}`)
  }
}

function publicObjectUrl(baseUrl, storageKey) {
  const encodedKey = storageKey.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`
}

async function saveReleaseRecord(status, payload) {
  return adminAction('publishRelease', {
    ...payload,
    status
  })
}

async function markReleaseFailed(error) {
  try {
    await saveReleaseRecord('failed', {
      version,
      channel,
      platform,
      architecture,
      releaseNotes: notes,
      mandatory,
      minimumSupportedVersion: process.env.MINIMUM_SUPPORTED_VERSION || null,
      published: false,
      storageProvider: 'r2',
      failureReason: error instanceof Error ? error.message.slice(0, 500) : 'R2 upload failed'
    })
  } catch (markError) {
    console.warn('Could not mark release as failed:', markError instanceof Error ? markError.message : markError)
  }
}

async function adminAction(action, payload) {
  return withAdminActionRetries(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, adminActionTimeoutMs)
    let response
    try {
      response = await fetch(process.env.ADMIN_LICENSE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_EDGE_SECRET
        },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw Object.assign(new Error(`${action} timed out after ${Math.round(adminActionTimeoutMs / 1000)} seconds.`), { code: 'ETIMEDOUT' })
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      const message = data.message || data.error || `${action} failed.`
      throw Object.assign(new Error(message), { status: response.status })
    }
    return data
  }, action)
}

async function withAdminActionRetries(fn, action) {
  let lastError
  for (let attempt = 1; attempt <= adminActionAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === adminActionAttempts || !shouldRetryAdminAction(error)) break
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15000)
      console.warn(`${action} failed on attempt ${attempt}; retrying in ${delayMs}ms.`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

function shouldRetryAdminAction(error) {
  const status = Number(error?.status || 0)
  if ([400, 401, 403].includes(status)) return false
  if (status >= 500) return true

  const code = error?.code || error?.cause?.code || error?.cause?.cause?.code
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT') return true

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('fetch failed')
}

function contentType(file) {
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return 'text/yaml; charset=utf-8'
  if (file.endsWith('.zip')) return 'application/zip'
  if (file.endsWith('.dmg')) return 'application/x-apple-diskimage'
  if (file.endsWith('.blockmap')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
