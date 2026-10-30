import { app, BrowserWindow, Menu, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getAppIconPath } from './icon'
import { registerIpc } from './ipc'
import { getDataRoot } from './paths'
import { rescheduleAll, stopAllSchedules } from './sync'
import { createTray, destroyTray } from './tray'

let mainWindow: BrowserWindow | null = null
let quitting = false

function resolvePreloadPath(): string {
  const candidate = join(__dirname, '../preload/index.js')
  if (!existsSync(candidate)) {
    console.error('[main] preload missing:', candidate)
  } else {
    console.log('[main] preload:', candidate)
  }
  return candidate
}

function createWindow(): void {
  const icon = getAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'Codeup 提交日志',
    show: false,
    autoHideMenuBar: true,
    // 无边框：用应用内自定义窗口按钮（可设 pointer 光标）
    frame: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  const emitMaximized = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', emitMaximized)
  mainWindow.on('unmaximize', emitMaximized)

  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  getDataRoot()
  // 去掉默认 File/Edit/View 菜单栏（Windows/Linux）
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  createTray(() => mainWindow)
  rescheduleAll()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  quitting = true
  stopAllSchedules()
  destroyTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 托盘常驻：不在此处 quit
  }
})
