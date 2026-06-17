import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const logsDir = path.join(root, '.logs')
const pidFile = path.join(logsDir, 'admin-server.pid')
const portFile = path.join(logsDir, 'admin-server.port')
const metaFile = path.join(logsDir, 'admin-server.json')
const logFile = path.join(logsDir, 'admin-server.log')

await main().catch(async (error) => {
  await appendLog(`[close-error] ${error instanceof Error ? error.stack || error.message : String(error)}`)
  console.error(`停止失败：${error instanceof Error ? error.message : '无法停止管理后台。'}`)
  process.exit(1)
})

async function main() {
  const pid = await readPid()
  if (!pid) {
    console.log('没有找到本项目管理后台的PID记录。')
    return
  }

  const meta = await readMeta()
  if (meta?.root && path.resolve(meta.root) !== root) {
    throw new Error('PID记录不属于当前项目，已拒绝停止。')
  }

  if (!isProcessAlive(pid)) {
    console.log('管理后台进程不存在，正在清理失效PID。')
    await cleanupFiles()
    return
  }

  console.log('正在停止管理后台……')
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    process.kill(pid, 'SIGTERM')
  }

  const stopped = await waitForExit(pid, 8000)
  if (!stopped) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      process.kill(pid, 'SIGKILL')
    }
  }

  await cleanupFiles()
  await appendLog(`[launcher] stopped pid=${pid}`)
  console.log('管理后台已停止。')
}

async function readPid() {
  try {
    const value = Number((await fsp.readFile(pidFile, 'utf8')).trim())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

async function readMeta() {
  try {
    return JSON.parse(await fsp.readFile(metaFile, 'utf8'))
  } catch {
    return null
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForExit(pid, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (!isProcessAlive(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return !isProcessAlive(pid)
}

async function cleanupFiles() {
  await Promise.allSettled([fsp.rm(pidFile, { force: true }), fsp.rm(portFile, { force: true }), fsp.rm(metaFile, { force: true })])
}

async function appendLog(line) {
  await fsp.mkdir(logsDir, { recursive: true })
  await fsp.appendFile(logFile, `${new Date().toISOString()} ${line}\n`, 'utf8')
}
