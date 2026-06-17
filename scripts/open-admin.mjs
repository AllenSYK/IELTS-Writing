import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const logsDir = path.join(root, '.logs')
const logFile = path.join(logsDir, 'admin-server.log')
const pidFile = path.join(logsDir, 'admin-server.pid')
const portFile = path.join(logsDir, 'admin-server.port')
const metaFile = path.join(logsDir, 'admin-server.json')
const healthPath = '/api/launcher/health'
const waitTimeoutMs = 60_000

await main().catch(async (error) => {
  await appendLog(`[launcher-error] ${error instanceof Error ? error.stack || error.message : String(error)}`)
  console.error(`启动失败：${error instanceof Error ? error.message : '管理后台服务未能启动。'}`)
  process.exit(1)
})

async function main() {
  console.log('正在检查管理后台服务……')
  await ensureLogsDir()
  await ensureProject()
  await ensureNodeModules()

  const existing = await findExistingProjectServer()
  if (existing) {
    await writePort(existing.port)
    console.log('管理后台已在运行，正在打开浏览器……')
    await openUrl(`http://127.0.0.1:${existing.port}/admin`)
    return
  }

  const port = await findUsablePort(3000)
  console.log('正在启动管理后台……')
  await startServer(port)
  await waitForHealth(port)
  console.log('管理后台已启动，正在打开浏览器……')
  await openUrl(`http://127.0.0.1:${port}/admin`)
}

async function ensureLogsDir() {
  await fsp.mkdir(logsDir, { recursive: true })
}

async function ensureProject() {
  const packagePath = path.join(root, 'package.json')
  if (!fs.existsSync(packagePath)) {
    throw new Error('项目路径不正确。')
  }
}

async function ensureNodeModules() {
  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    throw new Error('项目依赖尚未安装。请先执行 npm install。')
  }
}

async function findExistingProjectServer() {
  const pid = await readPid()
  const storedPort = await readPort()
  if (pid && storedPort && isProcessAlive(pid) && await isProjectServer(storedPort)) {
    return { port: storedPort, pid }
  }
  if (pid && !isProcessAlive(pid)) {
    await cleanupStalePid()
  }

  for (let port = 3000; port <= 3020; port += 1) {
    if (await isProjectServer(port)) return { port }
  }
  return null
}

async function findUsablePort(start) {
  for (let port = start; port <= start + 30; port += 1) {
    if (await isProjectServer(port)) return port
    if (!(await isPortOpen(port))) return port
  }
  throw new Error('3000 到 3030 端口都不可用。')
}

async function startServer(port) {
  const out = fs.openSync(logFile, 'a')
  const child = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      BROWSER: 'none',
      NEXT_TELEMETRY_DISABLED: '1'
    },
    stdio: ['ignore', out, out]
  })
  child.unref()
  await fsp.writeFile(pidFile, String(child.pid), 'utf8')
  await writePort(port)
  await fsp.writeFile(metaFile, JSON.stringify({ pid: child.pid, port, root, startedAt: new Date().toISOString() }, null, 2), 'utf8')
  await appendLog(`[launcher] started pid=${child.pid} port=${port}`)
}

async function waitForHealth(port) {
  const started = Date.now()
  while (Date.now() - started < waitTimeoutMs) {
    if (await isProjectServer(port)) return
    await sleep(750)
  }
  throw new Error('管理后台服务未能启动。')
}

async function isProjectServer(port) {
  try {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}${healthPath}`, { cache: 'no-store' }, 1500)
    if (!response.ok) return false
    const data = await response.json().catch(() => ({}))
    return data?.app === 'ielts-writing-desktop'
  } catch {
    return false
  }
}

async function isPortOpen(port) {
  try {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}`, { method: 'HEAD' }, 1200)
    return Boolean(response)
  } catch {
    return false
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function openUrl(url) {
  await run('open', [url])
}

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} 执行失败。`)))
    child.on('error', reject)
  })
}

async function readPid() {
  try {
    return Number((await fsp.readFile(pidFile, 'utf8')).trim())
  } catch {
    return null
  }
}

async function readPort() {
  try {
    const value = Number((await fsp.readFile(portFile, 'utf8')).trim())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

async function writePort(port) {
  await fsp.writeFile(portFile, String(port), 'utf8')
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function cleanupStalePid() {
  await Promise.allSettled([fsp.rm(pidFile, { force: true }), fsp.rm(portFile, { force: true }), fsp.rm(metaFile, { force: true })])
}

async function appendLog(line) {
  await ensureLogsDir()
  await fsp.appendFile(logFile, `${new Date().toISOString()} ${line}\n`, 'utf8')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
