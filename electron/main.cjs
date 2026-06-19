const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell, session } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const net = require('node:net')
const { fork } = require('node:child_process')
const { machineIdSync } = require('node-machine-id')
const semver = require('semver')

const APP_NAME = 'IELTS Writing'
const DEFAULT_PORT = 33791
const LICENSE_FILE = 'license.bin'
const INSTALL_FILE = 'installation.json'
const SERVER_CONFIG_FILE = 'server.production.json'
const REQUEST_TIMEOUT_MS = 15000
const AI_EVALUATION_TIMEOUT_BUFFER_MS = 10000
const SAFE_DESKTOP_CONFIG_KEYS = [
  'LICENSE_SERVER_URL',
  'APP_UPDATE_URL',
  'UPDATE_CHANNEL',
  'UPDATE_FEED_URL',
  'AUTO_UPDATE_DOWNLOAD_ENABLED',
  'NEXT_PUBLIC_DEVELOPER_CONTACT'
]
const SERVER_RUNTIME_CONFIG_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_DEVELOPER_CONTACT',
  'LICENSE_TOKEN_PUBLIC_KEY_PEM',
  'AI_PROVIDER',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'AI_TIMEOUT_MS'
]
const FORBIDDEN_DESKTOP_CONFIG_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'LICENSE_TOKEN_PRIVATE_KEY_PEM',
  'AI_API_KEY',
  'ADMIN_PASSWORD',
  'ADMIN_EDGE_SECRET'
]
const UPDATE_CHECKING_MESSAGE = '正在检查更新...'
const UPDATE_LATEST_MESSAGE = '当前已是最新版本'
const UPDATE_FAILED_MESSAGE = '暂时无法检查更新，请稍后重试。'
const MANUAL_UPDATE_MESSAGE = '请联系开发者获取最新版本'
const MANUAL_UPDATE_NO_CONTACT_MESSAGE = '请联系软件开发者获取最新版本。'
const MANDATORY_MANUAL_UPDATE_MESSAGE = '当前版本已停止维护，请联系开发者获取最新版本。'

let mainWindow = null
let activationWindow = null
let nextProcess = null
const desktopConfig = loadDesktopConfig()
let rendererUrl = process.env.ELECTRON_RENDERER_URL || null
let validating = false
let updateInFlight = false
let updateInitialTimer = null
let updateIntervalTimer = null
let updateManifest = null
let updaterState = null
let aiRequestsInFlight = 0
let installingUpdate = false
let periodicValidationTimer = null
let focusValidationRegistered = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  const target = mainWindow || activationWindow
  if (target) {
    if (target.isMinimized()) target.restore()
    target.focus()
  }
})

app.whenReady().then(async () => {
  logDesktopConfigStatus()
  await hardenSession()
  registerIpc()
  createMenu()
  configureUpdater()

  const license = await validateStoredLicense()
  console.info('[license] initial validation ok=%s message=%s errorType=%s', license.ok, license.message, license.errorType)
  
  if (license.ok) {
    await openMainWindow()
    scheduleRevalidation()
    scheduleUpdateChecks()
  } else {
    // 区分网络错误和许可证错误
    if (license.errorType === 'network') {
      // 网络错误：显示警告但允许用户选择
      const choice = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['重试', '离线使用', '退出'],
        defaultId: 0,
        cancelId: 2,
        message: '网络连接问题',
        detail: `无法连接到许可证服务器：${license.message}\n\n您可以选择重试、离线使用（某些功能可能受限）或退出应用。`
      })
      
      if (choice.response === 0) {
        // 用户选择重试
        app.relaunch()
        app.exit(0)
      } else if (choice.response === 1) {
        // 用户选择离线使用
        console.info('[license] User chose to use offline')
        await openMainWindow()
        scheduleRevalidation()
        scheduleUpdateChecks()
      } else {
        // 用户选择退出
        app.quit()
      }
    } else {
      // 许可证错误：显示激活窗口
      openActivationWindow(license.message)
    }
  }
}).catch((error) => {
  console.error('[startup-error]', error)
  dialog.showErrorBox('IELTS Writing failed to start', error instanceof Error ? error.message : String(error))
})

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void validateStoredLicense().then((license) => (license.ok ? openMainWindow() : openActivationWindow(license.message)))
  }
})

app.on('before-quit', () => {
  if (periodicValidationTimer) clearInterval(periodicValidationTimer)
  if (updateInitialTimer) clearTimeout(updateInitialTimer)
  if (updateIntervalTimer) clearInterval(updateIntervalTimer)
  stopNextServer()
})

function createMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        },
        {
          label: 'License Status',
          click: async () => {
            const info = await getLicenseInfo()
            dialog.showMessageBox({
              type: 'info',
              title: 'License Status',
              message: info.status,
              detail: `Plan: ${info.plan || 'Unknown'}\nExpires: ${info.expiresAt || 'Not available'}\nLast verified: ${info.lastValidatedAt || 'Not available'}`
            })
          }
        },
        {
          label: 'Check for Updates',
          click: () => void checkForUpdates(true)
        },
        {
          label: 'Clear Cache',
          click: async () => {
            const result = await clearAppCache()
            dialog.showMessageBox({ type: result.ok ? 'info' : 'error', message: result.message })
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function hardenSession() {
  const defaultSession = session.defaultSession
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' http://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:*; style-src 'self' 'unsafe-inline' http://127.0.0.1:*; img-src 'self' data: blob: http://127.0.0.1:*; connect-src 'self' http://127.0.0.1:* https:; font-src 'self' data:;"
        ],
        'X-Content-Type-Options': ['nosniff']
      }
    })
  })
}

function registerIpc() {
  ipcMain.handle('license:activate', async (_event, payload) => activateLicense(payload))
  ipcMain.handle('license:getInfo', async () => getLicenseInfo())
  ipcMain.handle('ai:evaluate', async (_event, payload) => evaluateEssay(payload))
  ipcMain.handle('ai:generatePrompt', async (_event, payload) => generatePrompt(payload))
  ipcMain.handle('updater:check', async () => checkForUpdates(true))
  ipcMain.handle('updater:getState', async () => getUpdaterState())
  ipcMain.handle('updater:download', async () => downloadUpdate())
  ipcMain.handle('updater:install', async () => installUpdate())
  ipcMain.handle('updater:dismiss', async () => dismissUpdate())
  ipcMain.handle('updater:contactDeveloper', async () => contactDeveloper())
  ipcMain.handle('app:getVersion', async () => app.getVersion())
  ipcMain.handle('app:getDeviceInfo', async () => ({
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname()
  }))
  ipcMain.handle('app:clearCache', async () => clearAppCache())
  ipcMain.handle('app:openUserHome', async () => openUserHomeFromAdmin())
}

function createBaseWindow(options) {
  const win = new BrowserWindow({
    show: false,
    backgroundColor: '#f9f9ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    },
    ...options
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowedLocal = rendererUrl && url.startsWith(rendererUrl)
    const allowedActivation = url.startsWith(`file://${path.join(__dirname, 'activation')}`)
    if (!allowedLocal && !allowedActivation) {
      event.preventDefault()
    }
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox(
      'IELTS Writing needs to reload',
      `The window stopped unexpectedly (${details.reason}). Your drafts are kept locally. Please reopen the app if the window does not recover.`
    )
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (errorCode === -3) return
    dialog.showErrorBox('Page failed to load', `${errorDescription || 'The local page could not load.'}\nYour local drafts are not removed.`)
  })
  win.on('unresponsive', () => {
    dialog.showMessageBox(win, {
      type: 'warning',
      message: 'IELTS Writing is not responding',
      detail: 'Please wait a moment. If it does not recover, restart the app; local drafts are preserved.'
    })
  })
  win.once('ready-to-show', () => win.show())
  return win
}

function openActivationWindow(message = '') {
  if (activationWindow) {
    activationWindow.focus()
    return
  }
  activationWindow = createBaseWindow({
    width: 460,
    height: 620,
    resizable: false,
    title: `${APP_NAME} Activation`
  })
  activationWindow.on('closed', () => {
    activationWindow = null
  })
  activationWindow.loadFile(path.join(__dirname, 'activation', 'index.html'), {
    query: { message, version: app.getVersion() }
  })
}

async function openMainWindow() {
  if (mainWindow) {
    mainWindow.focus()
    return
  }

  rendererUrl = rendererUrl || (await startNextServer())
  console.info('[renderer] loading %s', rendererUrl)
  mainWindow = createBaseWindow({
    width: 1320,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: APP_NAME
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  await mainWindow.loadURL(rendererUrl)
  console.info('[renderer] loaded')
  if (activationWindow) {
    activationWindow.close()
  }
}

async function openUserHomeFromAdmin() {
  try {
    const license = await validateStoredLicense()
    if (!license.ok) {
      openActivationWindow(license.message)
      return { ok: false, message: '用户端需要先完成授权验证。' }
    }

    if (!mainWindow) {
      await openMainWindow()
      return { ok: true, message: '已打开用户端。' }
    }

    if (mainWindow.isMinimized()) mainWindow.restore()
    const currentUrl = mainWindow.webContents.getURL()
    if (currentUrl && !new URL(currentUrl).pathname.startsWith('/admin')) {
      const baseUrl = getRendererBaseUrl()
      await mainWindow.loadURL(baseUrl)
      mainWindow.focus()
      return { ok: true, message: '已打开用户端。' }
    }

    const baseUrl = getRendererBaseUrl()
    await shell.openExternal(baseUrl)
    return { ok: true, message: '已在浏览器中打开用户端，管理员后台保持不变。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法打开用户端。'
    return { ok: false, message }
  }
}

async function startNextServer() {
  const port = await findAvailablePort(DEFAULT_PORT)
  const resources = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')
  const packagedStandalonePath = path.join(resources, 'app.asar.unpacked', '.next', 'standalone')
  const serverPath = app.isPackaged
    ? path.join(packagedStandalonePath, 'server.js')
    : path.join(resources, 'node_modules', 'next', 'dist', 'bin', 'next')

  if (!fs.existsSync(serverPath)) {
    throw new Error('The local application server is missing. Please reinstall IELTS Writing.')
  }
  console.info('[next-server] starting path=%s port=%s', serverPath, port)

  const env = {
    ...process.env,
    ...loadServerRuntimeConfig(),
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NEXT_PUBLIC_APP_VERSION: app.getVersion()
  }

  nextProcess = app.isPackaged
    ? fork(serverPath, [], {
        cwd: packagedStandalonePath,
        env,
        silent: true,
        windowsHide: true
      })
    : fork(serverPath, ['start', '-H', '127.0.0.1', '-p', String(port)], {
        cwd: path.resolve(__dirname, '..'),
        env,
        silent: true,
        windowsHide: true
      })

  nextProcess.on('exit', (code) => {
    console.info('[next-server] exited code=%s', code)
    if (mainWindow && code !== 0) {
      dialog.showErrorBox('Application server stopped', 'The local IELTS Writing service stopped unexpectedly.')
    }
  })
  nextProcess.stdout?.on('data', (chunk) => console.info('[next-server:stdout]', String(chunk).trim()))
  nextProcess.stderr?.on('data', (chunk) => console.error('[next-server:stderr]', String(chunk).trim()))

  await waitForPort(port, 20000)
  console.info('[next-server] ready port=%s', port)
  return `http://127.0.0.1:${port}`
}

function stopNextServer() {
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill()
  }
  nextProcess = null
}

function findAvailablePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer()
      server.once('error', () => tryPort(port + 1))
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port, '127.0.0.1')
    }
    try {
      tryPort(start)
    } catch (error) {
      reject(error)
    }
  })
}

function waitForPort(port, timeoutMs) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start > timeoutMs) {
          reject(new Error('The local application server could not start.'))
        } else {
          setTimeout(attempt, 250)
        }
      })
    }
    attempt()
  })
}

async function activateLicense(payload) {
  const schemaError = validateActivationPayload(payload)
  if (schemaError) {
    return { ok: false, message: schemaError }
  }

  const deviceId = getDeviceId()
  try {
    const endpoint = getLicenseServerUrl()
    const { response, data } = await fetchJsonWithTimeout(`${endpoint}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: payload.licenseKey,
        deviceId,
        deviceName: os.hostname(),
        platform: process.platform,
        appVersion: app.getVersion()
      })
    })
    if (!response.ok) {
      return { ok: false, message: data.message || activationErrorMessage(data.error, data) }
    }

    await saveLicense({
      token: data.licenseToken,
      plan: data.plan,
      expiresAt: data.expiresAt,
      lastValidatedAt: data.serverTime,
      status: 'active'
    })
    await openMainWindow()
    scheduleRevalidation()
    scheduleUpdateChecks()
    return { ok: true, message: 'Activation successful.' }
  } catch (error) {
    return { ok: false, message: requestErrorMessage(error, 'Activation') }
  }
}

function validateActivationPayload(payload) {
  if (!payload || typeof payload.licenseKey !== 'string') {
    return 'Please enter an activation code.'
  }
  const normalized = payload.licenseKey.trim().toUpperCase()
  if (!/^QGYX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
    return 'Activation code format should look like QGYX-XXXX-XXXX-XXXX-XXXX.'
  }
  return ''
}

function validateEvaluationPayload(payload) {
  if (!payload || typeof payload.essay !== 'string') {
    return 'Please enter an essay before submitting.'
  }
  if (payload.essay.trim().length < 50) {
    return 'Please write at least 50 characters before submitting.'
  }
  if (!['task1', 'task2'].includes(payload.taskType)) {
    return 'Unknown IELTS writing task type.'
  }
  return ''
}

function validatePromptPayload(payload) {
  if (!payload || !['task1', 'task2'].includes(payload.taskType)) {
    return 'Unknown IELTS writing task type.'
  }
  return ''
}

function getRendererBaseUrl() {
  if (rendererUrl) return rendererUrl.replace(/\/$/, '')
  const currentUrl = mainWindow?.webContents.getURL()
  if (currentUrl?.startsWith('http://127.0.0.1:')) {
    return new URL(currentUrl).origin
  }
  throw new Error('The local application server is not ready.')
}

async function evaluateEssay(payload) {
  const schemaError = validateEvaluationPayload(payload)
  if (schemaError) {
    return { ok: false, message: schemaError }
  }
  if (isMandatoryUpdateBlockingOnlineFeatures()) {
    return {
      ok: false,
      message: `Version ${updateManifest?.latestVersion || 'the latest version'} is required before using AI evaluation.`,
      error: 'mandatory_update_required'
    }
  }

  const stored = await readLicense()
  if (!stored?.token || stored.status !== 'active') {
    return { ok: false, message: 'Please activate IELTS Writing before using AI evaluation.', error: 'license_required' }
  }

  aiRequestsInFlight += 1
  try {
    const endpoint = `${getRendererBaseUrl()}/api/ai/evaluate`
    const { response, data } = await fetchJsonWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${stored.token}`,
          'x-device-id': getDeviceId()
        },
        body: JSON.stringify({
          essay: payload.essay,
          taskType: payload.taskType,
          prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
          questionType: typeof payload.questionType === 'string' ? payload.questionType : undefined,
          phase: payload.phase || 'full'
        })
      },
      getAiEvaluationRequestTimeoutMs()
    )
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data.error,
        message: data.message || data.error || 'AI evaluation failed.'
      }
    }
    return { ok: true, data }
  } catch (error) {
    return { ok: false, message: requestErrorMessage(error, 'AI evaluation') }
  } finally {
    aiRequestsInFlight = Math.max(0, aiRequestsInFlight - 1)
  }
}

async function generatePrompt(payload) {
  const schemaError = validatePromptPayload(payload)
  if (schemaError) {
    return { ok: false, message: schemaError }
  }
  if (isMandatoryUpdateBlockingOnlineFeatures()) {
    return {
      ok: false,
      message: `Version ${updateManifest?.latestVersion || 'the latest version'} is required before generating prompts.`,
      error: 'mandatory_update_required'
    }
  }

  const stored = await readLicense()
  if (!stored?.token || stored.status !== 'active') {
    return { ok: false, message: 'Please activate IELTS Writing before generating prompts.', error: 'license_required' }
  }

  try {
    const endpoint = `${getRendererBaseUrl()}/api/ai/generate-prompt`
    const { response, data } = await fetchJsonWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${stored.token}`,
          'x-device-id': getDeviceId()
        },
        body: JSON.stringify({
          taskType: payload.taskType,
          selection: payload.selection || {},
          excludePromptSummaries: Array.isArray(payload.excludePromptSummaries) ? payload.excludePromptSummaries : []
        })
      },
      120000
    )
    if (!response.ok || data.error) {
      return {
        ok: false,
        status: response.status,
        error: data.error,
        message: data.message || data.error || 'AI prompt generation failed.'
      }
    }
    return { ok: true, question: data.question }
  } catch (error) {
    return { ok: false, message: requestErrorMessage(error, 'AI prompt generation') }
  }
}

async function validateStoredLicense() {
  if (validating) {
    return { ok: true, message: 'Validation is already running.' }
  }
  validating = true
  try {
    const stored = await readLicense()
    if (!stored?.token) {
      return { ok: false, message: 'Please activate IELTS Writing before continuing.', errorType: 'no_token' }
    }

    const endpoint = getLicenseServerUrl()
    const { response, data } = await fetchJsonWithTimeout(`${endpoint}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseToken: stored.token,
        deviceId: getDeviceId(),
        appVersion: app.getVersion()
      })
    })
    if (!response.ok) {
      await saveLicense({ ...stored, status: data.status || 'invalid', lastValidatedAt: new Date().toISOString() })
      const errorMessage = activationErrorMessage(data.error, data)
      const isNetworkError = data.error === 'network_error' || data.error === 'timeout'
      return { ok: false, message: errorMessage, errorType: isNetworkError ? 'network' : 'license' }
    }

    await saveLicense({
      token: data.licenseToken || stored.token,
      plan: data.plan || stored.plan,
      expiresAt: data.expiresAt || stored.expiresAt,
      lastValidatedAt: data.serverTime || new Date().toISOString(),
      status: 'active'
    })
    return { ok: true, message: 'License verified.' }
  } catch (error) {
    const errorMessage = requestErrorMessage(error, 'License validation')
    const isNetworkError = error instanceof Error && 
      (error.name === 'AbortError' || 
       error.message.includes('Network') || 
       error.message.includes('fetch'))
    return { ok: false, message: errorMessage, errorType: isNetworkError ? 'network' : 'unknown' }
  } finally {
    validating = false
  }
}

function scheduleRevalidation() {
  if (periodicValidationTimer) clearInterval(periodicValidationTimer)
  periodicValidationTimer = setInterval(async () => {
    const result = await validateStoredLicense()
    if (!result.ok) {
      // 区分网络错误和许可证错误
      if (result.errorType === 'network') {
        // 网络错误：显示非侵入式通知，不关闭窗口
        console.warn('[license] Network error during periodic validation:', result.message)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('license:network-error', result.message)
        }
      } else {
        // 许可证错误：显示警告但不立即关闭窗口
        console.warn('[license] License validation failed:', result.message)
        if (mainWindow && !mainWindow.isDestroyed()) {
          const choice = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: ['重新激活', '稍后提醒'],
            defaultId: 0,
            cancelId: 1,
            message: '许可证验证失败',
            detail: `${result.message}\n\n您可以在当前会话中继续使用，但某些功能可能受限。建议您尽快重新激活。`
          })
          if (choice.response === 0) {
            // 用户选择重新激活
            openActivationWindow(result.message)
          }
          // 如果用户选择"稍后提醒"，继续使用但下次启动时需要验证
        }
      }
    }
  }, 6 * 60 * 60 * 1000)

  if (!focusValidationRegistered) {
    app.on('browser-window-focus', () => {
      void validateStoredLicense()
    })
    focusValidationRegistered = true
  }
}

function activationErrorMessage(code, details = {}) {
  if (code === 'license_not_allowed') {
    if (details.status === 'expired') return 'This activation code has expired.'
    if (details.status === 'revoked') return 'This activation code has been revoked.'
    if (details.status === 'suspended') return 'This activation code has been suspended.'
    if (details.status === 'disabled') return 'This activation code has been disabled.'
    if (details.reason === 'version_not_allowed') return 'This activation code is not allowed to run this version.'
  }
  
  // 处理网络错误
  if (code === 'network_error' || code === 'timeout') {
    return 'Network error. Please check your internet connection and try again.'
  }

  switch (code) {
    case 'invalid_license':
    case 'license_not_found':
    case 'not_found':
      return 'Activation code is invalid.'
    case 'license_expired':
    case 'expired':
      return 'This activation code has expired.'
    case 'revoked':
    case 'status_revoked':
      return 'This activation code has been revoked.'
    case 'suspended':
    case 'status_suspended':
      return 'This activation code has been suspended.'
    case 'disabled':
    case 'status_disabled':
      return 'This activation code has been disabled.'
    case 'license_not_allowed':
      return 'This activation code is not allowed to run this version.'
    case 'device_limit':
    case 'device_limit_reached':
      return 'This activation code has reached its device limit.'
    case 'activation_limit_reached':
      return 'This activation code has reached its activation limit.'
    case 'device_not_allowed':
      return 'This device is not allowed for the current license.'
    case 'rate_limited':
      return 'Too many activation attempts. Please wait a few minutes and try again.'
    default:
      return 'Activation failed. Please contact the administrator.'
  }
}

function getLicenseServerUrl() {
  const value = getDesktopConfigValue('LICENSE_SERVER_URL')
  if (!value) {
    throw new Error('License server is not configured.')
  }
  return value.replace(/\/$/, '')
}

function getAiEvaluationRequestTimeoutMs() {
  const defaultTimeoutMs = 240000
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || defaultTimeoutMs)
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultTimeoutMs
  return effectiveTimeoutMs + AI_EVALUATION_TIMEOUT_BUFFER_MS
}

async function fetchJsonWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    return { response, data }
  } finally {
    clearTimeout(timeout)
  }
}

function requestErrorMessage(error, action) {
  if (error instanceof Error && error.name === 'AbortError') {
    return `${action} timed out. Please check your connection and try again.`
  }
  if (error instanceof Error && error.message === 'License server is not configured.') {
    return 'License server is not configured. Please reinstall IELTS Writing.'
  }
  if (action === 'License validation') {
    return 'Network error. This app requires online license verification at startup.'
  }
  if (error instanceof Error && error.message.includes('fetch')) {
    return 'Network error. Please check your internet connection and try again.'
  }
  return 'Network error. Please check your connection and try again.'
}

function loadDesktopConfig() {
  if (!app.isPackaged) {
    const envPath = path.join(path.resolve(__dirname, '..'), '.env.local')
    const result = require('dotenv').config({ path: envPath })
    if (result.error && result.error.code !== 'ENOENT') {
      console.warn('[desktop-config] Failed to load development environment file.')
    }
    return { source: envPath, values: pickDesktopConfig(process.env) }
  }

  const configPath = path.join(process.resourcesPath, 'config.production.json')
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assertNoForbiddenDesktopConfig(parsed)
    const values = pickDesktopConfig(parsed)
    applyDesktopConfigToEnv(values)
    return { source: configPath, values }
  } catch (error) {
    console.error('[desktop-config] Failed to load production desktop config.')
    return { source: configPath, values: {} }
  }
}

function pickDesktopConfig(source) {
  const values = {}
  for (const key of SAFE_DESKTOP_CONFIG_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      values[key] = value.trim()
    }
  }
  return values
}

function assertNoForbiddenDesktopConfig(config) {
  for (const key of FORBIDDEN_DESKTOP_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      throw new Error('Production desktop config contains a forbidden secret setting.')
    }
  }
}

function applyDesktopConfigToEnv(values) {
  for (const key of SAFE_DESKTOP_CONFIG_KEYS) {
    if (values[key]) {
      process.env[key] = values[key]
    }
  }
}

function loadServerRuntimeConfig() {
  if (!app.isPackaged) return {}
  const configPath = path.join(app.getPath('userData'), SERVER_CONFIG_FILE)
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const values = {}
    for (const key of SERVER_RUNTIME_CONFIG_KEYS) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) {
        values[key] = value.trim()
      }
    }
    console.info(
      '[server-runtime-config] loaded=%s publicLicenseKey=%s ai=%s',
      configPath,
      Boolean(values.LICENSE_TOKEN_PUBLIC_KEY_PEM),
      Boolean(values.AI_API_KEY)
    )
    return values
  } catch {
    console.warn('[server-runtime-config] Packaged server runtime config is missing. Protected server APIs may be unavailable.')
    return {}
  }
}

function getDesktopConfigValue(key) {
  const value = desktopConfig.values[key] || (!app.isPackaged ? process.env[key] : '')
  return typeof value === 'string' ? value.trim() : ''
}

function logDesktopConfigStatus() {
  console.info(
    '[desktop-config] app.isPackaged=%s LICENSE_SERVER_URL.configured=%s APP_UPDATE_URL.configured=%s UPDATE_CHANNEL.configured=%s',
    app.isPackaged,
    Boolean(getDesktopConfigValue('LICENSE_SERVER_URL')),
    Boolean(getDesktopConfigValue('APP_UPDATE_URL')),
    Boolean(getDesktopConfigValue('UPDATE_CHANNEL'))
  )
}

function getDeviceId() {
  const install = getInstallationId()
  let machine = 'unknown-machine'
  try {
    machine = machineIdSync({ original: false })
  } catch {
    machine = os.hostname()
  }
  return crypto.createHash('sha256').update(`${process.platform}:${install}:${machine}`).digest('hex')
}

function getInstallationId() {
  const file = path.join(app.getPath('userData'), INSTALL_FILE)
  try {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (existing.installationId) return existing.installationId
  } catch {
    // Create a fresh installation ID below.
  }
  const installationId = crypto.randomUUID()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ installationId }, null, 2), { mode: 0o600 })
  return installationId
}

async function saveLicense(data) {
  const file = path.join(app.getPath('userData'), LICENSE_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const plaintext = JSON.stringify(data)
  const fallbackKeyFile = path.join(app.getPath('userData'), 'license.key')
  let key
  if (fs.existsSync(fallbackKeyFile)) {
    key = fs.readFileSync(fallbackKeyFile)
  } else {
    key = crypto.randomBytes(32)
    fs.writeFileSync(fallbackKeyFile, key, { mode: 0o600 })
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  fs.writeFileSync(file, Buffer.concat([Buffer.from('GCM1'), iv, tag, encrypted]), { mode: 0o600 })
}

async function readLicense() {
  const file = path.join(app.getPath('userData'), LICENSE_FILE)
  if (!fs.existsSync(file)) return null
  const encrypted = fs.readFileSync(file)
  const magic = encrypted.subarray(0, 4).toString('utf8')

  if (magic === 'GCM1') {
    try {
      const fallbackKeyFile = path.join(app.getPath('userData'), 'license.key')
      const key = fs.readFileSync(fallbackKeyFile)
      const iv = encrypted.subarray(4, 16)
      const tag = encrypted.subarray(16, 32)
      const payload = encrypted.subarray(32)
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8'))
    } catch {
      return null
    }
  }

  try {
    if (safeStorage.isEncryptionAvailable()) {
      const data = JSON.parse(safeStorage.decryptString(encrypted))
      await saveLicense(data)
      return data
    }
  } catch {
    // safeStorage decryption failed, cannot recover.
  }
  return null
}

async function getLicenseInfo() {
  const stored = await readLicense()
  return {
    status: stored?.status || 'not activated',
    plan: stored?.plan,
    expiresAt: stored?.expiresAt,
    lastValidatedAt: stored?.lastValidatedAt
  }
}

function configureUpdater() {
  autoUpdater.autoDownload = isAutoUpdateDownloadEnabled()
  autoUpdater.autoInstallOnAppQuit = isAutoUpdateDownloadEnabled()
  autoUpdater.channel = getUpdateChannel()

  const feedUrl = getDesktopConfigValue('UPDATE_FEED_URL')
  if (feedUrl) {
    setUpdaterFeedUrl(feedUrl)
  }

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({ status: 'checking-for-update', checking: true, message: UPDATE_CHECKING_MESSAGE })
  })
  autoUpdater.on('update-not-available', (info) => {
    setUpdaterState({
      status: 'update-not-available',
      checking: false,
      updateAvailable: false,
      latestVersion: info?.version || app.getVersion(),
      message: UPDATE_LATEST_MESSAGE
    })
  })
  autoUpdater.on('update-available', (info) => {
    setUpdaterState({
      status: 'update-available',
      checking: false,
      updateAvailable: true,
      latestVersion: info?.version || updateManifest?.latestVersion,
      message: '发现新版本'
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState({
      status: 'download-progress',
      checking: false,
      updateAvailable: true,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      message: '正在下载更新...'
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState({
      status: 'update-downloaded',
      checking: false,
      downloaded: true,
      updateAvailable: true,
      latestVersion: info?.version || updateManifest?.latestVersion,
      message: '更新已下载，可重启安装。'
    })
  })
  autoUpdater.on('error', (error) => {
    setUpdaterState({
      status: 'error',
      checking: false,
      error: error instanceof Error ? error.message : String(error),
      message: UPDATE_FAILED_MESSAGE
    })
  })
}

async function checkForUpdates(showDialogs) {
  if (updateInFlight) {
    return { ok: false, message: '正在检查更新，请稍候。', state: getUpdaterState() }
  }
  updateInFlight = true
  setUpdaterState({ status: 'checking-for-update', checking: true, error: null, message: UPDATE_CHECKING_MESSAGE })
  try {
    const appUpdateUrl = getDesktopConfigValue('APP_UPDATE_URL')
    if (appUpdateUrl) {
      const checkedAt = new Date().toISOString()
      const { response, data } = await fetchJsonWithTimeout(appUpdateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentVersion: app.getVersion(),
          platform: process.platform,
          architecture: process.arch,
          channel: getUpdateChannel(),
          deviceId: maskDeviceId(getDeviceId())
        })
      })
      if (!response.ok) {
        throw new Error(data.message || data.error || UPDATE_FAILED_MESSAGE)
      }
      if (!data.updateAvailable) {
        updateManifest = null
        setUpdaterState({
          status: 'update-not-available',
          checking: false,
          updateAvailable: false,
          latestVersion: data.latestVersion || app.getVersion(),
          downloaded: false,
          manualUpdateOnly: data.manualUpdateOnly !== false,
          lastCheckedAt: checkedAt,
          message: UPDATE_LATEST_MESSAGE
        })
        if (showDialogs && !mainWindow) dialog.showMessageBox({ message: UPDATE_LATEST_MESSAGE })
        return { ok: true, message: UPDATE_LATEST_MESSAGE, state: getUpdaterState() }
      }
      updateManifest = normalizeUpdateManifest(data)
      const updateMessage = getManualUpdateMessage(updateManifest)
      setUpdaterState({
        status: 'update-available',
        checking: false,
        updateAvailable: true,
        downloaded: false,
        latestVersion: updateManifest.latestVersion,
        releaseNotes: updateManifest.releaseNotes,
        mandatory: updateManifest.mandatory,
        minimumSupportedVersion: updateManifest.minimumSupportedVersion,
        publishedAt: updateManifest.publishedAt,
        downloadUrl: updateManifest.downloadUrl,
        metadataUrl: updateManifest.metadataUrl,
        sha512: updateManifest.sha512,
        fileSize: updateManifest.fileSize,
        releaseId: updateManifest.releaseId,
        manualUpdateOnly: updateManifest.manualUpdateOnly,
        lastCheckedAt: checkedAt,
        message: updateMessage
      })
      if (canUseAutoUpdaterForManifest(updateManifest)) {
        if (updateManifest.metadataUrl) {
          setUpdaterFeedUrl(feedUrlFromMetadataUrl(updateManifest.metadataUrl))
        } else if (getDesktopConfigValue('UPDATE_FEED_URL')) {
          setUpdaterFeedUrl(getDesktopConfigValue('UPDATE_FEED_URL'))
        } else {
          throw new Error('Update metadata URL is missing.')
        }
        await autoUpdater.checkForUpdates()
      }
      if (showDialogs && canUseAutoUpdaterForManifest(updateManifest)) {
        const choice = await dialog.showMessageBox({
          type: 'info',
          buttons: ['下载', '稍后'],
          defaultId: 0,
          cancelId: 1,
          message: `发现新版本 ${updateManifest.latestVersion}`,
          detail: updateManifest.releaseNotes || '可稍后在设置中更新。'
        })
        if (choice.response === 0) {
          return await downloadUpdate()
        }
      }
      if (showDialogs && !mainWindow && !canUseAutoUpdaterForManifest(updateManifest)) {
        await showManualUpdateDialog(updateManifest)
      }
      return { ok: true, message: updateMessage, state: getUpdaterState() }
    }

    const feedUrl = getDesktopConfigValue('UPDATE_FEED_URL')
    if (!feedUrl || !isAutoUpdateDownloadEnabled()) {
      setUpdaterState({ status: 'error', checking: false, message: UPDATE_FAILED_MESSAGE, error: UPDATE_FAILED_MESSAGE })
      return { ok: false, message: UPDATE_FAILED_MESSAGE, state: getUpdaterState() }
    }

    setUpdaterFeedUrl(feedUrl)
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo?.version) {
      if (showDialogs && !mainWindow) dialog.showMessageBox({ message: UPDATE_LATEST_MESSAGE })
      return { ok: true, message: UPDATE_LATEST_MESSAGE, state: getUpdaterState() }
    }
    updateManifest = normalizeUpdateManifest({ latestVersion: result.updateInfo.version })
    return { ok: true, message: '发现新版本', state: getUpdaterState() }
  } catch (error) {
    console.warn('[updater] check failed', error instanceof Error ? error.message : error)
    setUpdaterState({ status: 'error', checking: false, error: UPDATE_FAILED_MESSAGE, message: UPDATE_FAILED_MESSAGE })
    if (showDialogs && !mainWindow) dialog.showErrorBox('检查更新失败', UPDATE_FAILED_MESSAGE)
    return { ok: false, message: UPDATE_FAILED_MESSAGE, state: getUpdaterState() }
  } finally {
    updateInFlight = false
  }
}

async function downloadUpdate() {
  if (!isAutoUpdateDownloadEnabled() || updateManifest?.manualUpdateOnly) {
    const message = getManualUpdateMessage(updateManifest)
    setUpdaterState({ status: updateManifest ? 'update-available' : 'idle', checking: false, manualUpdateOnly: true, message })
    return { ok: false, message, state: getUpdaterState() }
  }
  if (!app.isPackaged) {
    return { ok: false, message: '开发环境已禁用自动更新下载。', state: getUpdaterState() }
  }
  if (!updateManifest && !getDesktopConfigValue('UPDATE_FEED_URL')) {
    return { ok: false, message: 'No update is ready to download.', state: getUpdaterState() }
  }
  try {
    setUpdaterState({ status: 'download-progress', checking: false, message: '正在下载更新...', percent: 0, transferred: 0, total: updateManifest?.fileSize || 0 })
    await recordUpdateDownload()
    await autoUpdater.downloadUpdate()
    return { ok: true, message: '正在下载更新...', state: getUpdaterState() }
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新下载失败。'
    setUpdaterState({ status: 'error', checking: false, error: message, message })
    return { ok: false, message, state: getUpdaterState() }
  }
}

async function installUpdate() {
  if (!isAutoUpdateDownloadEnabled() || updateManifest?.manualUpdateOnly) {
    const message = getManualUpdateMessage(updateManifest)
    setUpdaterState({ status: updateManifest ? 'update-available' : 'idle', checking: false, manualUpdateOnly: true, message })
    return { ok: false, message, state: getUpdaterState() }
  }
  if (!getUpdaterState().downloaded) {
    return { ok: false, message: 'No downloaded update is ready to install.', state: getUpdaterState() }
  }
  if (aiRequestsInFlight > 0) {
    return { ok: false, message: 'AI evaluation is still running. Please install after it finishes.', state: getUpdaterState() }
  }
  if (installingUpdate) {
    return { ok: false, message: 'Install is already starting.', state: getUpdaterState() }
  }
  installingUpdate = true
  try {
    await prepareRendererForUpdateInstall()
    const confirmOptions = {
      type: 'info',
      buttons: ['重启并安装', '稍后'],
      defaultId: 0,
      cancelId: 1,
      message: '重启 IELTS Writing 并安装更新？',
      detail: '本地草稿会先尝试保存，请在 AI 批改完成后再安装。'
    }
    const choice = mainWindow ? await dialog.showMessageBox(mainWindow, confirmOptions) : await dialog.showMessageBox(confirmOptions)
    if (choice.response !== 0) {
      installingUpdate = false
      return { ok: true, message: 'Install postponed.', state: getUpdaterState() }
    }
    autoUpdater.quitAndInstall(false, true)
    return { ok: true, message: '正在重启并安装更新。', state: getUpdaterState() }
  } catch (error) {
    installingUpdate = false
    const message = error instanceof Error ? error.message : '更新安装失败。'
    setUpdaterState({ status: 'error', error: message, message })
    return { ok: false, message, state: getUpdaterState() }
  }
}

function dismissUpdate() {
  setUpdaterState({ message: '已稍后提醒。' })
  return { ok: true, state: getUpdaterState() }
}

function scheduleUpdateChecks() {
  if (!getDesktopConfigValue('APP_UPDATE_URL') && !isAutoUpdateDownloadEnabled()) {
    setUpdaterState({ status: 'idle', message: UPDATE_FAILED_MESSAGE })
    return
  }
  if (updateInitialTimer) clearTimeout(updateInitialTimer)
  if (updateIntervalTimer) clearInterval(updateIntervalTimer)
  const delayMs = 10000 + Math.floor(Math.random() * 10000)
  updateInitialTimer = setTimeout(() => void checkForUpdates(false), delayMs)
  updateIntervalTimer = setInterval(() => void checkForUpdates(false), 6 * 60 * 60 * 1000)
}

function normalizeUpdateManifest(data) {
  const minimumSupportedVersion = data.minimumSupportedVersion || data.minimum_supported_version || null
  const belowMinimum =
    minimumSupportedVersion &&
    semver.valid(minimumSupportedVersion) &&
    semver.valid(app.getVersion()) &&
    semver.lt(app.getVersion(), minimumSupportedVersion)
  return {
    releaseId: data.releaseId || data.id || null,
    latestVersion: data.latestVersion || data.version || app.getVersion(),
    mandatory: Boolean(data.mandatory) || Boolean(belowMinimum),
    minimumSupportedVersion,
    releaseNotes: data.releaseNotes || data.release_notes || '',
    publishedAt: data.publishedAt || data.published_at || null,
    downloadUrl: data.downloadUrl || data.download_url || null,
    metadataUrl: data.metadataUrl || data.metadata_url || null,
    sha512: data.sha512 || data.fileHash || data.file_hash || null,
    fileSize: Number(data.fileSize || data.file_size || 0),
    manualUpdateOnly: data.manualUpdateOnly !== false && data.manual_update_only !== false
  }
}

function getManualUpdateMessage(manifest = updateManifest) {
  if (manifest?.mandatory) return MANDATORY_MANUAL_UPDATE_MESSAGE
  return getDeveloperContactTarget() ? MANUAL_UPDATE_MESSAGE : MANUAL_UPDATE_NO_CONTACT_MESSAGE
}

function canUseAutoUpdaterForManifest(manifest) {
  return Boolean(isAutoUpdateDownloadEnabled() && manifest && !manifest.manualUpdateOnly)
}

function getUpdaterState() {
  if (!updaterState) {
    updaterState = {
      status: 'idle',
      checking: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      channel: getUpdateChannel(),
      updateAvailable: false,
      downloaded: false,
      mandatory: false,
      manualUpdateOnly: true,
      message: 'Ready',
      lastCheckedAt: null,
      aiRequestsInFlight
    }
  }
  return {
    ...updaterState,
    currentVersion: app.getVersion(),
    channel: getUpdateChannel(),
    aiRequestsInFlight,
    manualUpdateOnly: updaterState.manualUpdateOnly !== false || !isAutoUpdateDownloadEnabled(),
    autoUpdateDownloadEnabled: isAutoUpdateDownloadEnabled(),
    developerContactAvailable: Boolean(getDeveloperContactTarget())
  }
}

function setUpdaterState(patch) {
  updaterState = {
    ...getUpdaterState(),
    ...patch
  }
  mainWindow?.webContents.send('updater:state', getUpdaterState())
  if (typeof updaterState.percent === 'number') {
    mainWindow?.webContents.send('updater:progress', {
      percent: updaterState.percent,
      transferred: updaterState.transferred || 0,
      total: updaterState.total || updaterState.fileSize || 0,
      bytesPerSecond: updaterState.bytesPerSecond || 0
    })
  }
}

function getUpdateChannel() {
  return getDesktopConfigValue('UPDATE_CHANNEL') || 'stable'
}

function isAutoUpdateDownloadEnabled() {
  return (getDesktopConfigValue('AUTO_UPDATE_DOWNLOAD_ENABLED') || '').toLowerCase() === 'true'
}

function getDeveloperContactTarget() {
  const value = getDesktopConfigValue('NEXT_PUBLIC_DEVELOPER_CONTACT')
  if (!value) return null
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { type: 'email', url: `mailto:${value}` }
  }
  try {
    const url = new URL(value)
    if (url.protocol === 'mailto:') return { type: 'email', url: url.toString() }
    if (url.protocol === 'https:' || url.protocol === 'http:') return { type: 'url', url: url.toString() }
  } catch {
    try {
      const url = new URL(`https://${value}`)
      return { type: 'url', url: url.toString() }
    } catch {
      return null
    }
  }
  return null
}

async function contactDeveloper() {
  const target = getDeveloperContactTarget()
  if (!target) {
    return { ok: false, message: MANUAL_UPDATE_NO_CONTACT_MESSAGE }
  }
  await shell.openExternal(target.url)
  return { ok: true, message: '已打开开发者联系方式。' }
}

async function showManualUpdateDialog(manifest) {
  const hasContact = Boolean(getDeveloperContactTarget())
  const choice = await dialog.showMessageBox({
    type: manifest.mandatory ? 'warning' : 'info',
    buttons: hasContact ? ['我知道了', '联系开发者'] : ['我知道了'],
    defaultId: 0,
    cancelId: 0,
    message: '发现新版本',
    detail: [
      `当前版本: ${app.getVersion()}`,
      `最新版本: ${manifest.latestVersion}`,
      manifest.releaseNotes ? `更新说明: ${manifest.releaseNotes}` : '',
      manifest.publishedAt ? `发布时间: ${manifest.publishedAt}` : '',
      getManualUpdateMessage(manifest)
    ].filter(Boolean).join('\n')
  })
  if (choice.response === 1) {
    await contactDeveloper()
  }
}

function setUpdaterFeedUrl(feedUrl) {
  const normalized = feedUrl.replace(/\/$/, '')
  autoUpdater.setFeedURL({ provider: 'generic', url: normalized })
}

function feedUrlFromMetadataUrl(metadataUrl) {
  const url = new URL(metadataUrl)
  if (url.protocol !== 'https:') {
    throw new Error('Update metadata must use HTTPS.')
  }
  url.pathname = url.pathname.replace(/\/[^/]*$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

async function recordUpdateDownload() {
  const appUpdateUrl = getDesktopConfigValue('APP_UPDATE_URL')
  if (!appUpdateUrl || !updateManifest?.releaseId) return
  try {
    await fetchJsonWithTimeout(appUpdateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'download',
        releaseId: updateManifest.releaseId,
        deviceId: maskDeviceId(getDeviceId())
      })
    }, 8000)
  } catch {
    // Download telemetry must not block the updater.
  }
}

async function prepareRendererForUpdateInstall() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  await mainWindow.webContents.executeJavaScript(
    "window.dispatchEvent(new CustomEvent('aerowrite:save-drafts-before-update')); true",
    true
  ).catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 500))
}

function isMandatoryUpdateBlockingOnlineFeatures() {
  return Boolean(updateManifest?.mandatory && !updateManifest.manualUpdateOnly && isAutoUpdateDownloadEnabled())
}

function maskDeviceId(deviceId) {
  return `${deviceId.slice(0, 10)}...${deviceId.slice(-6)}`
}

async function clearAppCache() {
  try {
    await session.defaultSession.clearCache()
    return { ok: true, message: 'Cache cleared.' }
  } catch {
    return { ok: false, message: 'Cache could not be cleared.' }
  }
}
