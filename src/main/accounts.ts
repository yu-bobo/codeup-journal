import { existsSync, readFileSync, writeFileSync } from 'fs'
import { v4 as uuid } from 'uuid'
import type { Account, AccountInput, AccountUpdate } from '@shared/types'
import { accountsPath } from './paths'
import { deleteToken, loadToken, saveToken } from './vault'
import { db } from './db'

interface Store {
  accounts: Account[]
  activeAccountId: string | null
}

function loadStore(): Store {
  const path = accountsPath()
  if (!existsSync(path)) return { accounts: [], activeAccountId: null }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Store
  } catch {
    return { accounts: [], activeAccountId: null }
  }
}

function saveStore(store: Store): void {
  writeFileSync(accountsPath(), JSON.stringify(store, null, 2), 'utf8')
}

export function listAccounts(): Account[] {
  return loadStore().accounts
}

export function getActiveAccountId(): string | null {
  return loadStore().activeAccountId
}

export function setActiveAccountId(id: string | null): void {
  const store = loadStore()
  store.activeAccountId = id
  saveStore(store)
}

export function getAccount(id: string): Account | undefined {
  return loadStore().accounts.find((a) => a.id === id)
}

export function createAccount(input: AccountInput): Account {
  const now = new Date().toISOString()
  const account: Account = {
    id: uuid(),
    name: input.name.trim(),
    edition: input.edition,
    organizationId: input.organizationId?.trim() || undefined,
    apiBaseUrl: input.apiBaseUrl?.trim().replace(/\/$/, '') || undefined,
    authorFilters: (input.authorFilters || []).map((s) => s.trim()).filter(Boolean),
    defaultBranch: input.defaultBranch?.trim() || 'master',
    watchedRepoIds: input.watchedRepoIds ?? [],
    repoBranches: input.repoBranches ?? {},
    createdAt: now,
    updatedAt: now
  }
  validateAccount(account, input.token)
  saveToken(account.id, input.token.trim())
  const store = loadStore()
  store.accounts.push(account)
  if (!store.activeAccountId) store.activeAccountId = account.id
  saveStore(store)
  return account
}

export function updateAccount(input: AccountUpdate): Account {
  const store = loadStore()
  const idx = store.accounts.findIndex((a) => a.id === input.id)
  // 编辑态残留 / 热更新导致 id 已不在本地时，有令牌则改为新建
  if (idx < 0) {
    if (!input.token?.trim()) {
      throw new Error('账号不存在，请关闭弹窗后点「新建账号」，并填写个人访问令牌后保存')
    }
    return createAccount({
      name: input.name || '未命名账号',
      edition: input.edition || 'central',
      organizationId: input.organizationId,
      apiBaseUrl: input.apiBaseUrl,
      token: input.token,
      authorFilters: input.authorFilters || [],
      defaultBranch: input.defaultBranch,
      watchedRepoIds: input.watchedRepoIds,
      repoBranches: input.repoBranches
    })
  }
  const prev = store.accounts[idx]
  const next: Account = {
    ...prev,
    name: input.name?.trim() ?? prev.name,
    edition: input.edition ?? prev.edition,
    organizationId:
      input.organizationId !== undefined
        ? input.organizationId.trim() || undefined
        : prev.organizationId,
    apiBaseUrl:
      input.apiBaseUrl !== undefined
        ? input.apiBaseUrl.trim().replace(/\/$/, '') || undefined
        : prev.apiBaseUrl,
    authorFilters:
      input.authorFilters !== undefined
        ? input.authorFilters.map((s) => s.trim()).filter(Boolean)
        : prev.authorFilters,
    defaultBranch: input.defaultBranch?.trim() || prev.defaultBranch,
    watchedRepoIds: input.watchedRepoIds ?? prev.watchedRepoIds,
    repoBranches: input.repoBranches ?? prev.repoBranches,
    updatedAt: new Date().toISOString()
  }
  validateAccount(next, input.token ?? loadToken(next.id) ?? '')
  if (input.token?.trim()) saveToken(next.id, input.token.trim())
  store.accounts[idx] = next
  saveStore(store)
  return next
}

export function deleteAccount(id: string): void {
  const store = loadStore()
  store.accounts = store.accounts.filter((a) => a.id !== id)
  if (store.activeAccountId === id) {
    store.activeAccountId = store.accounts[0]?.id ?? null
  }
  saveStore(store)
  deleteToken(id)
  db.deleteAccountData(id)
}

export function getAccountToken(id: string): string {
  const token = loadToken(id)
  if (!token) throw new Error('未找到该账号的访问令牌，请重新编辑并填写 PAT')
  return token
}

function validateAccount(account: Account, token: string): void {
  if (!account.name) throw new Error('请填写账号名称')
  if (!token.trim()) throw new Error('请填写个人访问令牌')
  if (account.edition === 'central' && !account.organizationId) {
    throw new Error('中心版需填写 organizationId')
  }
  if (account.edition === 'region' && !account.apiBaseUrl) {
    throw new Error('Region 版需填写 API Base URL')
  }
}
