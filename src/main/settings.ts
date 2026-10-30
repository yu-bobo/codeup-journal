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

// 对齐 work-report skill：可复制纯文本要点、按周期控条数、合并同类
export const DEFAULT_AI_SYSTEM_PROMPT = `你是一名工程师助理，根据 Git/Codeup 提交记录整理可直接粘贴的中文工作要点。
要求：
- 只输出纯文本工作要点，不要 Markdown（不要 #、**、代码围栏、表格、链接）
- 不要写标题、开场白、结尾、「工作摘要」「提交数」；不要输出工作日统计表（程序会另附元信息）
- 以工作重点为主：合并同类 feat/fix；相关改动并一条；宁少勿碎
- 条数随周期（全文合计，跨仓合计）：日报约 3～8 条；周报约 3～7 条；月报约 5～12 条；自定义区间按跨度取 5～12，宁少勿碎
- 单条写具体功能/修复，禁止「优化页面」「修 bug」等空话；忠实于提交，不编造
- 省略环境变量微调、注释、未使用导入、镜像地址切换等琐碎 chore（除非是周期内唯一产出）
- 多仓库：每个仓库名单独一行（与提交里的路径一致，不要改名），其下用「1. 2. 3.」（数字+英文句点+空格）；各仓序号各自从 1 起；行间直接换行，仓库与条目之间不要空行
- 解析约定：优先 type(scope): 简述；正文中的 - 列表可作工作点依据`

export const DEFAULT_AI_USER_PROMPT_TEMPLATE = `请根据提交记录，为账号「{{accountName}}」整理 {{kind}}（{{period}}）工作要点。

提交数：{{commitCount}}
条数指引：{{guidance}}

输出示例（无空行）：
services/project/foo/bar
1. 完成……
2. 修复……
services/project/baz
1. 实现……

提交记录：
{{commits}}`

// 旧默认文案：加载时自动换成当前默认
const LEGACY_AI_SYSTEM_PROMPTS = [
  `你是一名工程师助理，根据当日代码提交记录撰写简洁的工作日报。
要求：
- 用中文，条理清晰，可直接用于工作汇报
- 合并琐碎/重复提交，突出完成的功能与修复
- 只依据提供的提交内容，不要编造未出现的工作
- 不要逐条复述 commit message，写成工作成果表述
- 输出纯 Markdown 正文，不要包裹代码围栏，不要写标题「工作摘要」`,
  `你是一名工程师助理，根据代码提交记录撰写简洁的工作汇报（可为日报、周报、月报或自定义区间）。
要求：
- 用中文，条理清晰，可直接用于工作汇报
- 合并琐碎/重复提交，突出完成的功能与修复
- 只依据提供的提交内容，不要编造未出现的工作
- 不要逐条复述 commit message，写成工作成果表述
- 输出纯 Markdown 正文，不要包裹代码围栏，不要写标题「工作摘要」`,
  `你是一名工程师助理，根据代码提交记录整理可直接粘贴到汇报表单的工作条目。
要求：
- 用中文；只输出纯文本，不要 Markdown（不要 #、**、代码围栏、表格、链接）
- 按代码仓库分组；仓库名与提交记录中的路径保持一致，不要改名
- 同一仓库内相近、重复的提交合并成一条，写成工作成果，不要逐条复述 commit message
- 只依据提供的提交内容，不要编造
- 日报：每仓可写若干条，仍须合并同类
- 周报/月报/自定义：每个仓库最多 3～5 条高阶成果，单条一句话；省略环境变量、注释、导入清理、镜像地址切换等琐碎 chore
- 格式：仓库路径单独一行，其下用「1. 2. 3.」；仓与仓之间空一行
- 不要写「工作摘要」「提交数」等标题，不要开场白和结尾说明`
]

const LEGACY_AI_USER_PROMPT_TEMPLATES = [
  `请根据以下提交记录，为账号「{{accountName}}」撰写 {{date}} 的工作日报摘要。

提交数：{{commitCount}}

提交记录：
{{commits}}`,
  `请根据以下提交记录，为账号「{{accountName}}」撰写 {{kind}}（{{period}}）摘要。

提交数：{{commitCount}}

提交记录：
{{commits}}`,
  `请根据以下提交记录，为账号「{{accountName}}」整理 {{kind}}（{{period}}）工作条目。

提交数：{{commitCount}}

输出结构示例：
仓库路径A
1. ……
2. ……

仓库路径B
1. ……

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
