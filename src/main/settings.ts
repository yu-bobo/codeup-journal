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
  // AI 日报
  aiEnabled: boolean
  aiBaseUrl: string
  aiModel: string
  // 每日触发时刻 HH:mm
  aiDailyAt: string
  aiSystemPrompt: string
  aiUserPromptTemplate: string
  // 上次成功跑完定时 AI 日报的本地日期 YYYY-MM-DD（防同日重复）
  lastAiDailyDate: string
}

export const DEFAULT_SYNC_INTERVAL_MINUTES = 30
export const DEFAULT_SYNC_LOOKBACK_DAYS = 90
export const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com/v1'
export const DEFAULT_AI_MODEL = 'deepseek-chat'
export const DEFAULT_AI_DAILY_AT = '18:00'

export const DEFAULT_AI_SYSTEM_PROMPT = `你是一名工程师助理，根据代码提交记录撰写简洁的工作汇报（可为日报、周报、月报或自定义区间）。
要求：
- 用中文，条理清晰，可直接用于工作汇报
- 合并琐碎/重复提交，突出完成的功能与修复
- 只依据提供的提交内容，不要编造未出现的工作
- 不要逐条复述 commit message，写成工作成果表述
- 输出纯 Markdown 正文，不要包裹代码围栏，不要写标题「工作摘要」`

export const DEFAULT_AI_USER_PROMPT_TEMPLATE = `请根据以下提交记录，为账号「{{accountName}}」撰写 {{kind}}（{{period}}）摘要。

提交数：{{commitCount}}

提交记录：
{{commits}}`

// 旧版仅日报默认文案：加载时自动换成当前默认
const LEGACY_AI_SYSTEM_PROMPTS = [
  `你是一名工程师助理，根据当日代码提交记录撰写简洁的工作日报。
要求：
- 用中文，条理清晰，可直接用于工作汇报
- 合并琐碎/重复提交，突出完成的功能与修复
- 只依据提供的提交内容，不要编造未出现的工作
- 不要逐条复述 commit message，写成工作成果表述
- 输出纯 Markdown 正文，不要包裹代码围栏，不要写标题「工作摘要」`
]

const LEGACY_AI_USER_PROMPT_TEMPLATES = [
  `请根据以下提交记录，为账号「{{accountName}}」撰写 {{date}} 的工作日报摘要。

提交数：{{commitCount}}

提交记录：
{{commits}}`
]

function resolvePrompt(
  value: unknown,
  currentDefault: string,
  legacy: string[]
): string {
  if (typeof value !== 'string' || !value.trim()) return currentDefault
  const trimmed = value.trim()
  if (legacy.some((l) => l.trim() === trimmed)) return currentDefault
  return value
}

const DEFAULT: AppSettings = {
  exportsPath: '',
  syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  syncLookbackDays: DEFAULT_SYNC_LOOKBACK_DAYS,
  aiEnabled: false,
  aiBaseUrl: DEFAULT_AI_BASE_URL,
  aiModel: DEFAULT_AI_MODEL,
  aiDailyAt: DEFAULT_AI_DAILY_AT,
  aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
  aiUserPromptTemplate: DEFAULT_AI_USER_PROMPT_TEMPLATE,
  lastAiDailyDate: ''
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

// 校验并规范化 HH:mm
export function normalizeAiDailyAt(value?: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw)
  if (!m) return DEFAULT_AI_DAILY_AT
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function normalizeAiSettings(raw: Partial<AppSettings>): Pick<
  AppSettings,
  | 'aiEnabled'
  | 'aiBaseUrl'
  | 'aiModel'
  | 'aiDailyAt'
  | 'aiSystemPrompt'
  | 'aiUserPromptTemplate'
  | 'lastAiDailyDate'
> {
  return {
    aiEnabled: Boolean(raw.aiEnabled),
    aiBaseUrl:
      typeof raw.aiBaseUrl === 'string' && raw.aiBaseUrl.trim()
        ? raw.aiBaseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_AI_BASE_URL,
    aiModel:
      typeof raw.aiModel === 'string' && raw.aiModel.trim()
        ? raw.aiModel.trim()
        : DEFAULT_AI_MODEL,
    aiDailyAt: normalizeAiDailyAt(raw.aiDailyAt),
    aiSystemPrompt: resolvePrompt(
      raw.aiSystemPrompt,
      DEFAULT_AI_SYSTEM_PROMPT,
      LEGACY_AI_SYSTEM_PROMPTS
    ),
    aiUserPromptTemplate: resolvePrompt(
      raw.aiUserPromptTemplate,
      DEFAULT_AI_USER_PROMPT_TEMPLATE,
      LEGACY_AI_USER_PROMPT_TEMPLATES
    ),
    lastAiDailyDate:
      typeof raw.lastAiDailyDate === 'string' ? raw.lastAiDailyDate.trim() : ''
  }
}

export function loadSettings(): AppSettings {
  const path = settingsFile()
  if (!existsSync(path)) return { ...DEFAULT }
  try {
    const raw = { ...DEFAULT, ...JSON.parse(readFileSync(path, 'utf8')) }
    return {
      exportsPath: typeof raw.exportsPath === 'string' ? raw.exportsPath : '',
      syncIntervalMinutes: clampSyncIntervalMinutes(raw.syncIntervalMinutes),
      syncLookbackDays: clampSyncLookbackDays(raw.syncLookbackDays),
      ...normalizeAiSettings(raw)
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const merged: AppSettings = {
    exportsPath:
      patch.exportsPath !== undefined ? patch.exportsPath.trim() : current.exportsPath,
    syncIntervalMinutes:
      patch.syncIntervalMinutes !== undefined
        ? clampSyncIntervalMinutes(patch.syncIntervalMinutes)
        : current.syncIntervalMinutes,
    syncLookbackDays:
      patch.syncLookbackDays !== undefined
        ? clampSyncLookbackDays(patch.syncLookbackDays)
        : current.syncLookbackDays,
    aiEnabled: patch.aiEnabled !== undefined ? Boolean(patch.aiEnabled) : current.aiEnabled,
    aiBaseUrl: patch.aiBaseUrl !== undefined ? patch.aiBaseUrl : current.aiBaseUrl,
    aiModel: patch.aiModel !== undefined ? patch.aiModel : current.aiModel,
    aiDailyAt: patch.aiDailyAt !== undefined ? patch.aiDailyAt : current.aiDailyAt,
    aiSystemPrompt:
      patch.aiSystemPrompt !== undefined ? patch.aiSystemPrompt : current.aiSystemPrompt,
    aiUserPromptTemplate:
      patch.aiUserPromptTemplate !== undefined
        ? patch.aiUserPromptTemplate
        : current.aiUserPromptTemplate,
    lastAiDailyDate:
      patch.lastAiDailyDate !== undefined ? patch.lastAiDailyDate : current.lastAiDailyDate
  }
  const next: AppSettings = {
    exportsPath: merged.exportsPath,
    syncIntervalMinutes: merged.syncIntervalMinutes,
    syncLookbackDays: merged.syncLookbackDays,
    ...normalizeAiSettings(merged)
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

export type AiSettingsPatch = Partial<
  Pick<
    AppSettings,
    | 'aiEnabled'
    | 'aiBaseUrl'
    | 'aiModel'
    | 'aiDailyAt'
    | 'aiSystemPrompt'
    | 'aiUserPromptTemplate'
  >
>

export function setAiSettings(patch: AiSettingsPatch): AppSettings {
  return saveSettings(patch)
}

export function setLastAiDailyDate(date: string): AppSettings {
  return saveSettings({ lastAiDailyDate: date })
}
