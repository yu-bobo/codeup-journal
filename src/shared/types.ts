export type OrgEdition = 'central' | 'region'

export interface Account {
  id: string
  name: string
  edition: OrgEdition
  // 中心版组织 ID
  organizationId?: string
  // Region 版 API Base，如 https://xxx.devops.aliyuncs.com
  apiBaseUrl?: string
  // 作者过滤（邮箱或姓名，小写比较）
  authorFilters: string[]
  // 默认同步分支
  defaultBranch: string
  // 关注的仓库 ID；空数组表示同步全部可见仓库
  watchedRepoIds: number[]
  // 按仓库覆盖分支：repoId -> branch
  repoBranches: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface AccountInput {
  name: string
  edition: OrgEdition
  organizationId?: string
  apiBaseUrl?: string
  token: string
  authorFilters: string[]
  defaultBranch?: string
  watchedRepoIds?: number[]
  repoBranches?: Record<string, string>
}

export interface AccountUpdate extends Partial<AccountInput> {
  id: string
}

export interface CodeupRepo {
  id: number
  name: string
  pathWithNamespace: string
  webUrl: string
  lastActivityAt?: string
  defaultBranch?: string
  // 当前用户权限：20 浏览者 / 30 开发者 / 40 管理员
  accessLevel?: number
  // private | internal
  visibility?: string
  starred?: boolean
  // 来自 codeup authorized/list，对应网页「我参与的」
  participating?: boolean
}

export interface StoredCommit {
  id: string
  accountId: string
  repoId: number
  repoName: string
  sha: string
  shortId: string
  title: string
  message: string
  authorName: string
  authorEmail: string
  committedAt: string
  webUrl: string
  syncedAt: string
}

export interface SyncState {
  accountId: string
  repoId: number
  lastSyncedAt: string
}

export interface SyncLog {
  id: string
  accountId: string
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface SyncResult {
  accountId: string
  fetched: number
  inserted: number
  errors: string[]
}

export type ReportKind = 'day' | 'week' | 'month' | 'custom'

export interface ReportRequest {
  accountId: string
  kind: ReportKind
  // ISO date YYYY-MM-DD；custom 时用 from/to
  date?: string
  from?: string
  to?: string
}

export interface ReportResult {
  title: string
  markdown: string
  filePath?: string
  commitCount: number
}

export interface CommitsQuery {
  accountId: string
  repoId?: number
  from?: string
  to?: string
  keyword?: string
  limit?: number
  offset?: number
}

export interface AppSettingsView {
  exportsPath: string
  resolvedExportsPath: string
  defaultExportsPath: string
  isCustomExports: boolean
  syncIntervalMinutes: number
  syncLookbackDays: number
  defaultSyncIntervalMinutes: number
  defaultSyncLookbackDays: number
  aiEnabled: boolean
  aiBaseUrl: string
  aiModel: string
  aiDailyAt: string
  aiSystemPrompt: string
  aiUserPromptTemplate: string
  aiApiKeyConfigured: boolean
  defaultAiBaseUrl: string
  defaultAiModel: string
  defaultAiDailyAt: string
  defaultAiSystemPrompt: string
  defaultAiUserPromptTemplate: string
}

export interface AiSettingsInput {
  aiEnabled?: boolean
  aiBaseUrl?: string
  aiModel?: string
  aiDailyAt?: string
  aiSystemPrompt?: string
  aiUserPromptTemplate?: string
  // 可选：一并写入加密 API Key（空字符串表示不改）
  apiKey?: string
}

export interface AiDailyBatchResult {
  date: string
  results: {
    accountId: string
    accountName: string
    ok: boolean
    skipped?: boolean
    message: string
  }[]
}
