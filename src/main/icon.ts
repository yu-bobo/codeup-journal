import { app, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

// 开发态：相对 out/main → 项目根 resources/；打包后：process.resourcesPath
function resolveAsset(...parts: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, ...parts)
  }
  return join(__dirname, '../../resources', ...parts)
}

/**
 * 解析应用图标路径（优先 ico，其次 png）
 */
export function getAppIconPath(): string | undefined {
  const candidates = [resolveAsset('icon.ico'), resolveAsset('icon.png'), resolveAsset('icon-32.png')]
  return candidates.find((p) => existsSync(p))
}

/**
 * 托盘用小图标（Windows 缩到 16px）
 */
export function getTrayIcon(): Electron.NativeImage {
  const candidates = [resolveAsset('icon-32.png'), resolveAsset('icon.png'), resolveAsset('icon.ico')]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) {
      return process.platform === 'win32' ? img.resize({ width: 16, height: 16 }) : img
    }
  }
  return nativeImage.createEmpty()
}
