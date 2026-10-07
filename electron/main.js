/**
 * Electron Main Process — Gregory POS
 *
 * Creates the POS window and spawns the print-proxy as a child process
 * so receipt printing works without a separate terminal window.
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow = null
let printProxyProcess = null
let tray = null

// ── Paths ────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged
const printProxyPath = isDev
  ? path.join(__dirname, '..', 'print-proxy.js')
  : path.join(process.resourcesPath, 'print-proxy.js')

const distPath = isDev
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'dist')

// ── Print Proxy ──────────────────────────────────────────────────────────
function startPrintProxy() {
  if (printProxyProcess) return

  console.log('[Electron] Starting print proxy...')
  // Use Electron's own binary as the Node runtime (ELECTRON_RUN_AS_NODE) so the
  // packaged exe works on POS terminals that don't have Node installed.
  printProxyProcess = spawn(process.execPath, [printProxyPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  printProxyProcess.stdout.on('data', (data) => {
    console.log(`[PrintProxy] ${data.toString().trim()}`)
  })

  printProxyProcess.stderr.on('data', (data) => {
    console.error(`[PrintProxy] ${data.toString().trim()}`)
  })

  printProxyProcess.on('exit', (code) => {
    console.log(`[PrintProxy] Exited with code ${code}`)
    printProxyProcess = null
  })
}

function stopPrintProxy() {
  if (printProxyProcess) {
    printProxyProcess.kill()
    printProxyProcess = null
  }
}

// ── Printer Status Check ─────────────────────────────────────────────────
function checkPrinterStatus() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:9101/status', { timeout: 2000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          resolve({ online: false })
        }
      })
    })
    req.on('error', () => resolve({ online: false }))
    req.on('timeout', () => { req.destroy(); resolve({ online: false }) })
  })
}

// ── Window ───────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Gregory POS — Powered by Vavoom',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the built Vite app
  if (isDev) {
    // In dev, try Vite dev server first
    mainWindow.loadURL('http://localhost:5175').catch(() => {
      mainWindow.loadFile(path.join(distPath, 'index.html'))
    })
  } else {
    mainWindow.loadFile(path.join(distPath, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Fullscreen for kiosk mode (toggle with F11)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })
}

// ── System Tray ──────────────────────────────────────────────────────────
function createTray() {
  // Create a simple tray icon (16x16 purple square)
  const icon = nativeImage.createFromBuffer(
    Buffer.alloc(16 * 16 * 4, Buffer.from([156, 94, 245, 255]))
  , { width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('Gregory POS')

  updateTrayMenu()

  // Periodically update printer status in tray
  setInterval(async () => {
    updateTrayMenu()
  }, 10000)
}

async function updateTrayMenu() {
  if (!tray) return
  const status = await checkPrinterStatus()
  const printerLabel = status.online
    ? `🟢 Printer Online (${status.printerIp})`
    : '🔴 Printer Offline'

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Gregory POS', enabled: false },
    { type: 'separator' },
    { label: printerLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Show POS',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    {
      label: 'Fullscreen',
      click: () => {
        if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ])
  tray.setContextMenu(contextMenu)
}

// ── IPC Handlers ─────────────────────────────────────────────────────────
ipcMain.handle('printer:status', async () => {
  return await checkPrinterStatus()
})

// ── App Lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startPrintProxy()

  // Give print proxy a moment to start
  setTimeout(() => {
    createWindow()
    createTray()
  }, 500)
})

app.on('window-all-closed', () => {
  // Don't quit — keep running in tray
  // On macOS this is standard behavior
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
})

app.on('before-quit', () => {
  stopPrintProxy()
})
