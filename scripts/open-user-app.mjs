import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const logsDir = path.join(root, '.logs')
const logFile = path.join(logsDir, 'electron-dev.log')
const pidFile = path.join(logsDir, 'electron-dev.pid')
const metaFile = path.join(logsDir, 'electron-dev.json')
const installedApp = '/Applications/IELTS Writing.app'
const packagedApp = path.join(root, 'release', 'mac-arm64', 'IELTS Writing.app')

await main().catch(async (error) => {
  await appendLog(`[launcher-error] ${error instanceof Error ? error.stack || error.message : String(error)}`)
  console.error(`启动失败：${error instanceof Error ? error.message : '没有找到应用文件。'}`)
  process.exit(1)
})

async function main() {
  await fsp.mkdir(logsDir, { recursive: true })
  console.log('正在查找已安装应用……')

  if (fs.existsSync(installedApp)) {
    console.log('已找到正式应用，正在打开……')
    await openApp(installedApp)
    return
  }

  if (fs.existsSync(packagedApp)) {
    console.log('已找到打包应用，正在打开……')
    await openApp(packagedApp)
    return
  }

  await ensureNodeModules()

  const pid = await readPid()
  if (pid && isProcessAlive(pid)) {
    console.log('开发版应用已在运行，正在尝试聚焦窗口……')
    await focusApp()
    return
  }
  if (pid) {
    await cleanupStalePid()
  }

  console.log('没有找到应用文件，正在启动开发版……')
  await startElectronDev()
  console.log('开发版正在启动，请稍候查看应用窗口。')
}

async function ensureNodeModules() {
  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    throw new Error('项目依赖尚未安装。请先执行 npm install。')
  }
}

async function openApp(appPath) {
  await run('open', [appPath])
}

async function focusApp() {
  try {
    await run('osascript', ['-e', 'tell application "IELTS Writing" to activate'])
  } catch {
    await appendLog('[launcher] focus existing development window failed')
  }
}

async function startElectronDev() {
  const out = fs.openSync(logFile, 'a')
  const child = spawn('npm', ['run', 'electron:dev'], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1'
    },
    stdio: ['ignore', out, out]
  })
  child.unref()
  await fsp.writeFile(pidFile, String(child.pid), 'utf8')
  await fsp.writeFile(metaFile, JSON.stringify({ pid: child.pid, root, startedAt: new Date().toISOString() }, null, 2), 'utf8')
  await appendLog(`[launcher] started electron dev pid=${child.pid}`)
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
    const value = Number((await fsp.readFile(pidFile, 'utf8')).trim())
    return Number.isFinite(value) ? value : null
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

async function cleanupStalePid() {
  await Promise.allSettled([fsp.rm(pidFile, { force: true }), fsp.rm(metaFile, { force: true })])
}

async function appendLog(line) {
  await fsp.mkdir(logsDir, { recursive: true })
  await fsp.appendFile(logFile, `${new Date().toISOString()} ${line}\n`, 'utf8')
}
