import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface AppSettings {
  // 材料根目录；空则使用默认 userData/exports
  exportsPath: string
  // 定时同步间隔（分钟）
  syncIntervalMinutes: number
  // 首次同步 / 重置后回溯天数
  syncLookbackDays: number
}

export const DEFAULT_SYNC_INTERVAL_MINUTES = 30
export const DEFAULT_SYNC_LOOKBACK_DAYS = 90

const DEFAULT: AppSettings = {
  exportsPath: '',
  syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  syncLookbackDays: DEFAULT_SYNC_LOOKBACK_DAYS
}

function settingsFile(): string {
  // 与 getDataRoot 同级：直接落在 Electron userData，不再多套一层
  const root = app.getPath('userData')
  mkdirSync(root, { recursive: true })
  return join(root, 'settings.json')
}

export function clampSyncIntervalMinutes(minutes?: number): number {
  const n = Number(minutes)
  if (!Number.isFinite(n)) return DEFAULT_SYNC_INTERVAL_MINUTES
  return Math.min(1440, Math.max(5, Math.round(n)))
}

export function clampSyncLookbackDays(days?: number): number {
  const n = Number(days)
  if (!Number.isFinite(n)) return DEFAULT_SYNC_LOOKBACK_DAYS
  return Math.min(3650, Math.max(1, Math.round(n)))
}

export function loadSettings(): AppSettings {
  const path = settingsFile()
  if (!existsSync(path)) return { ...DEFAULT }
  try {
    const raw = { ...DEFAULT, ...JSON.parse(readFileSync(path, 'utf8')) }
    return {
      exportsPath: typeof raw.exportsPath === 'string' ? raw.exportsPath : '',
      syncIntervalMinutes: clampSyncIntervalMinutes(raw.syncIntervalMinutes),
      syncLookbackDays: clampSyncLookbackDays(raw.syncLookbackDays)
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const next: AppSettings = {
    exportsPath:
      patch.exportsPath !== undefined ? patch.exportsPath.trim() : current.exportsPath,
    syncIntervalMinutes:
      patch.syncIntervalMinutes !== undefined
        ? clampSyncIntervalMinutes(patch.syncIntervalMinutes)
        : current.syncIntervalMinutes,
    syncLookbackDays:
      patch.syncLookbackDays !== undefined
        ? clampSyncLookbackDays(patch.syncLookbackDays)
        : current.syncLookbackDays
  }
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function getExportsPathSetting(): string {
  return loadSettings().exportsPath || ''
}

export function setExportsPathSetting(path: string): AppSettings {
  return saveSettings({ exportsPath: path.trim() })
}

export function getSyncIntervalMinutes(): number {
  return loadSettings().syncIntervalMinutes
}

export function setSyncIntervalMinutes(minutes: number): AppSettings {
  return saveSettings({ syncIntervalMinutes: minutes })
}

export function getSyncLookbackDays(): number {
  return loadSettings().syncLookbackDays
}

export function setSyncLookbackDays(days: number): AppSettings {
  return saveSettings({ syncLookbackDays: days })
}
