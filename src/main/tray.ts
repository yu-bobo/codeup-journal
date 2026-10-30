import { app, BrowserWindow, Menu, Tray } from 'electron'
import { getTrayIcon } from './icon'

let tray: Tray | null = null

export function createTray(getWindow: () => BrowserWindow | null): void {
  if (tray) return
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Codeup 提交日志')
  const show = (): void => {
    const win = getWindow()
    if (!win) return
    win.show()
    win.focus()
  }
  tray.on('double-click', show)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: show },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit()
        }
      }
    ])
  )
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
