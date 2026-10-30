import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AccountInput,
  AccountUpdate,
  AiDailyBatchResult,
  AiSettingsInput,
  AppSettingsView,
  CodeupRepo,
  CommitsQuery,
  ReportRequest,
  ReportResult,
  StoredCommit,
  SyncLog,
  SyncResult
} from '../shared/types'

const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    getActive: (): Promise<string | null> => ipcRenderer.invoke('accounts:getActive'),
    setActive: (id: string | null): Promise<string | null> =>
      ipcRenderer.invoke('accounts:setActive', id),
    create: (input: AccountInput): Promise<Account> => ipcRenderer.invoke('accounts:create', input),
    update: (input: AccountUpdate): Promise<Account> => ipcRenderer.invoke('accounts:update', input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('accounts:delete', id),
    test: (input: AccountInput): Promise<{ repoCount: number }> =>
      ipcRenderer.invoke('accounts:test', input),
    testSaved: (id: string): Promise<{ repoCount: number }> =>
      ipcRenderer.invoke('accounts:testSaved', id)
  },
  repos: {
    list: (accountId: string): Promise<CodeupRepo[]> => ipcRenderer.invoke('repos:list', accountId),
    listWithCommits: (accountId: string): Promise<CodeupRepo[]> =>
      ipcRenderer.invoke('repos:listWithCommits', accountId),
    refresh: (accountId: string): Promise<CodeupRepo[]> =>
      ipcRenderer.invoke('repos:refresh', accountId),
    setWatched: (
      accountId: string,
      watchedRepoIds: number[],
      repoBranches?: Record<string, string>
    ): Promise<Account> =>
      ipcRenderer.invoke('repos:setWatched', accountId, watchedRepoIds, repoBranches),
    listBranches: (
      accountId: string,
      repositoryId: number,
      search?: string
    ): Promise<{ name: string; defaultBranch?: boolean; protected?: boolean }[]> =>
      ipcRenderer.invoke('repos:listBranches', accountId, repositoryId, search)
  },
  commits: {
    query: (
      query: CommitsQuery
    ): Promise<{ items: StoredCommit[]; total: number }> =>
      ipcRenderer.invoke('commits:query', query),
    reset: (
      accountId: string,
      repoId?: number
    ): Promise<{ deletedCommits: number }> =>
      ipcRenderer.invoke('commits:reset', accountId, repoId)
  },
  sync: {
    run: (accountId: string, repoIds?: number[]): Promise<SyncResult> =>
      ipcRenderer.invoke('sync:run', accountId, repoIds),
    logs: (accountId: string): Promise<SyncLog[]> => ipcRenderer.invoke('sync:logs', accountId)
  },
  reports: {
    generate: (req: ReportRequest): Promise<ReportResult> =>
      ipcRenderer.invoke('reports:generate', req),
    preview: (req: ReportRequest): Promise<ReportResult> =>
      ipcRenderer.invoke('reports:preview', req)
  },
  ai: {
    testConnection: (): Promise<{ ok: true; reply: string }> =>
      ipcRenderer.invoke('ai:testConnection'),
    runDailyNow: (): Promise<AiDailyBatchResult> => ipcRenderer.invoke('ai:runDailyNow'),
    generateReport: (
      req: ReportRequest
    ): Promise<ReportResult & { skipped?: boolean; usedAi: boolean }> =>
      ipcRenderer.invoke('ai:generateReport', req)
  },
  app: {
    openExports: (): Promise<boolean> => ipcRenderer.invoke('app:openExports'),
    openDataRoot: (): Promise<boolean> => ipcRenderer.invoke('app:openDataRoot'),
    openPath: (path: string): Promise<boolean> => ipcRenderer.invoke('app:openPath', path),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('app:openExternal', url)
  },
  window: {
    minimize: (): Promise<boolean> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
    close: (): Promise<boolean> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (listener: (maximized: boolean) => void): (() => void) => {
      const handler = (_event: unknown, maximized: boolean) => listener(maximized)
      ipcRenderer.on('window:maximized-changed', handler)
      return () => ipcRenderer.removeListener('window:maximized-changed', handler)
    }
  },
  settings: {
    get: (): Promise<AppSettingsView> => ipcRenderer.invoke('settings:get'),
    setExportsPath: (path: string): Promise<AppSettingsView> =>
      ipcRenderer.invoke('settings:setExportsPath', path),
    setSyncIntervalMinutes: (minutes: number): Promise<AppSettingsView> =>
      ipcRenderer.invoke('settings:setSyncIntervalMinutes', minutes),
    setSyncLookbackDays: (days: number): Promise<AppSettingsView> =>
      ipcRenderer.invoke('settings:setSyncLookbackDays', days),
    setAi: (patch: AiSettingsInput): Promise<AppSettingsView> =>
      ipcRenderer.invoke('settings:setAi', patch),
    setAiApiKey: (key: string): Promise<AppSettingsView> =>
      ipcRenderer.invoke('settings:setAiApiKey', key),
    clearAiApiKey: (): Promise<AppSettingsView> => ipcRenderer.invoke('settings:clearAiApiKey'),
    pickExportsDir: (): Promise<AppSettingsView | null> =>
      ipcRenderer.invoke('settings:pickExportsDir')
  }
}

function exposeApi(): void {
  try {
    if (process.contextIsolated) {
      contextBridge.exposeInMainWorld('api', api)
    } else {
      // contextIsolation 关闭时直接挂到 window
      ;(globalThis as unknown as { api: typeof api }).api = api
    }
  } catch (err) {
    console.error('[preload] expose api failed:', err)
    try {
      ;(globalThis as unknown as { api: typeof api }).api = api
    } catch (err2) {
      console.error('[preload] fallback assign failed:', err2)
    }
  }
}

exposeApi()

export type JournalApi = typeof api
