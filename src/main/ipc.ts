import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { v4 as uuid } from 'uuid'
import type { AccountInput, AccountUpdate, CommitsQuery, ReportRequest } from '@shared/types'
import {
  createAccount,
  deleteAccount,
  getAccount,
  getAccountToken,
  getActiveAccountId,
  listAccounts,
  setActiveAccountId,
  updateAccount
} from './accounts'
import { testConnection, listAllRepositories, listBranches } from './codeup'
import { db } from './db'
import { generateReport } from './reports'
import { defaultExportsDir, exportsDir, getDataRoot } from './paths'
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  DEFAULT_SYNC_LOOKBACK_DAYS,
  loadSettings,
  setExportsPathSetting,
  setSyncIntervalMinutes,
  setSyncLookbackDays
} from './settings'
import { rescheduleAll, scheduleAccount, syncAccount } from './sync'

export function registerIpc(): void {
  ipcMain.handle('accounts:list', () => listAccounts())
  ipcMain.handle('accounts:getActive', () => getActiveAccountId())
  ipcMain.handle('accounts:setActive', (_e, id: string | null) => {
    setActiveAccountId(id)
    return getActiveAccountId()
  })
  ipcMain.handle('accounts:create', (_e, input: AccountInput) => {
    const account = createAccount(input)
    scheduleAccount(account.id)
    return account
  })
  ipcMain.handle('accounts:update', (_e, input: AccountUpdate) => {
    const account = updateAccount(input)
    scheduleAccount(account.id)
    return account
  })
  ipcMain.handle('accounts:delete', (_e, id: string) => {
    deleteAccount(id)
    rescheduleAll()
    return true
  })
  ipcMain.handle('accounts:test', async (_e, input: AccountInput) => {
    // 允许用表单临时参数测试，不一定已保存
    const temp = {
      id: 'temp',
      name: input.name || 'temp',
      edition: input.edition,
      organizationId: input.organizationId,
      apiBaseUrl: input.apiBaseUrl,
      authorFilters: input.authorFilters || [],
      defaultBranch: input.defaultBranch || 'master',
      watchedRepoIds: [],
      repoBranches: {},
      createdAt: '',
      updatedAt: ''
    }
    return testConnection(temp, input.token)
  })
  ipcMain.handle('accounts:testSaved', async (_e, id: string) => {
    const account = getAccount(id)
    if (!account) throw new Error('账号不存在')
    return testConnection(account, getAccountToken(id))
  })

  ipcMain.handle('repos:list', (_e, accountId: string) => db.listRepos(accountId))
  ipcMain.handle('repos:listWithCommits', (_e, accountId: string) =>
    db.listReposWithCommits(accountId)
  )
  ipcMain.handle('repos:refresh', async (_e, accountId: string) => {
    const account = getAccount(accountId)
    if (!account) throw new Error('账号不存在')
    const repos = await listAllRepositories(account, getAccountToken(accountId))
    db.upsertRepos(accountId, repos)
    return repos
  })
  ipcMain.handle(
    'repos:setWatched',
    (_e, accountId: string, watchedRepoIds: number[], repoBranches?: Record<string, string>) => {
      return updateAccount({
        id: accountId,
        watchedRepoIds,
        repoBranches
      })
    }
  )
  ipcMain.handle(
    'repos:listBranches',
    async (_e, accountId: string, repositoryId: number, search?: string) => {
      const account = getAccount(accountId)
      if (!account) throw new Error('账号不存在')
      return listBranches(account, getAccountToken(accountId), repositoryId, search)
    }
  )

  ipcMain.handle('commits:query', (_e, query: CommitsQuery) => db.queryCommits(query))
  ipcMain.handle('commits:reset', (_e, accountId: string, repoId?: number) => {
    if (!getAccount(accountId)) throw new Error('账号不存在')
    const result = db.clearCommits(accountId, repoId)
    db.addSyncLog({
      id: uuid(),
      accountId,
      at: new Date().toISOString(),
      level: 'info',
      message:
        repoId != null
          ? `已重置仓库 ${repoId} 的提交记录（删除 ${result.deletedCommits} 条）`
          : `已重置全部提交记录（删除 ${result.deletedCommits} 条）`
    })
    return result
  })

  ipcMain.handle('sync:run', async (_e, accountId: string, repoIds?: number[]) =>
    syncAccount(accountId, repoIds)
  )
  ipcMain.handle('sync:logs', (_e, accountId: string) => db.listSyncLogs(accountId))

  ipcMain.handle('reports:generate', (_e, req: ReportRequest) => generateReport(req, true))
  ipcMain.handle('reports:preview', (_e, req: ReportRequest) => generateReport(req, false))

  ipcMain.handle('app:openExports', async () => {
    await shell.openPath(exportsDir())
    return true
  })
  ipcMain.handle('app:openDataRoot', async () => {
    await shell.openPath(getDataRoot())
    return true
  })
  ipcMain.handle('app:openPath', async (_e, path: string) => {
    if (path) await shell.openPath(path)
    return true
  })
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (url) await shell.openExternal(url)
    return true
  })

  const windowFromEvent = (e: Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(e.sender)

  ipcMain.handle('window:minimize', (e) => {
    windowFromEvent(e)?.minimize()
    return true
  })
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = windowFromEvent(e)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (e) => {
    windowFromEvent(e)?.close()
    return true
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return windowFromEvent(e)?.isMaximized() ?? false
  })
  const settingsDto = () => {
    const s = loadSettings()
    return {
      exportsPath: s.exportsPath,
      resolvedExportsPath: exportsDir(),
      defaultExportsPath: defaultExportsDir(),
      isCustomExports: Boolean(s.exportsPath),
      syncIntervalMinutes: s.syncIntervalMinutes,
      syncLookbackDays: s.syncLookbackDays,
      defaultSyncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
      defaultSyncLookbackDays: DEFAULT_SYNC_LOOKBACK_DAYS
    }
  }

  ipcMain.handle('settings:get', () => settingsDto())
  ipcMain.handle('settings:setExportsPath', (_e, path: string) => {
    setExportsPathSetting(path || '')
    return settingsDto()
  })
  ipcMain.handle('settings:setSyncIntervalMinutes', (_e, minutes: number) => {
    setSyncIntervalMinutes(minutes)
    rescheduleAll()
    return settingsDto()
  })
  ipcMain.handle('settings:setSyncLookbackDays', (_e, days: number) => {
    setSyncLookbackDays(days)
    return settingsDto()
  })
  ipcMain.handle('settings:pickExportsDir', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? undefined, {
      title: '选择材料落盘目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: exportsDir()
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    setExportsPathSetting(result.filePaths[0])
    return settingsDto()
  })
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}
