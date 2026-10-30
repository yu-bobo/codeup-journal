import { app } from 'electron'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync
} from 'fs'
import { join } from 'path'
import { getExportsPathSetting } from './settings'

let migrated = false

// Windows 下目录被占用时 rename 会 EPERM，退化为复制后再删源
function movePath(from: string, to: string): void {
  try {
    renameSync(from, to)
    return
  } catch (e: any) {
    if (e?.code !== 'EPERM' && e?.code !== 'EACCES' && e?.code !== 'EBUSY') throw e
  }
  cpSync(from, to, { recursive: true })
  rmSync(from, { recursive: true, force: true })
}

// 从旧目录迁入 userData：嵌套子目录，或更名的 codeup-commit-journal 根目录
function migrateFromLegacyDir(legacy: string, userData: string): void {
  if (!existsSync(legacy)) return

  for (const name of ['accounts.json', 'settings.json', 'data.json', 'secrets', 'exports']) {
    const from = join(legacy, name)
    const to = join(userData, name)
    if (!existsSync(from) || existsSync(to)) continue
    try {
      movePath(from, to)
    } catch (e) {
      console.warn(`[paths] 迁移 ${name} 失败，将继续使用或稍后重试:`, e)
    }
  }

  try {
    if (readdirSync(legacy).length === 0) rmdirSync(legacy)
  } catch {
    // 残留文件则保留旧目录，不影响新路径读写
  }
}

function migrateLegacyNestedRoot(): void {
  if (migrated) return
  migrated = true
  const userData = app.getPath('userData')
  // 旧版多嵌了一层 userData/codeup-commit-journal/
  migrateFromLegacyDir(join(userData, 'codeup-commit-journal'), userData)
  // 包名从 codeup-commit-journal 改为 codeup-journal 后的旧 userData
  migrateFromLegacyDir(join(userData, '..', 'codeup-commit-journal'), userData)
}

export function getDataRoot(): string {
  migrateLegacyNestedRoot()
  const root = app.getPath('userData')
  mkdirSync(root, { recursive: true })
  mkdirSync(join(root, 'secrets'), { recursive: true })
  return root
}

export function defaultExportsDir(): string {
  return join(getDataRoot(), 'exports')
}

export function exportsDir(): string {
  const custom = getExportsPathSetting()
  const root = custom || defaultExportsDir()
  mkdirSync(root, { recursive: true })
  mkdirSync(join(root, 'reports'), { recursive: true })
  return root
}

export function reportsDir(): string {
  const dir = join(exportsDir(), 'reports')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function accountsPath(): string {
  return join(getDataRoot(), 'accounts.json')
}

export function secretPath(accountId: string): string {
  return join(getDataRoot(), 'secrets', `${accountId}.bin`)
}

export function dbPath(): string {
  return join(getDataRoot(), 'data.json')
}
