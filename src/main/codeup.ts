import type { Account, CodeupRepo } from '@shared/types'

export interface CodeupCommit {
  id: string
  shortId: string
  title: string
  message: string
  authorName: string
  authorEmail: string
  authoredDate: string
  committedDate: string
  committerName: string
  committerEmail: string
  webUrl: string
  parentIds?: string[]
}

function baseUrl(account: Account): string {
  if (account.edition === 'region') {
    if (!account.apiBaseUrl) throw new Error('缺少 API Base URL')
    return account.apiBaseUrl.replace(/\/$/, '')
  }
  return 'https://openapi-rdc.aliyuncs.com'
}

function orgPrefix(account: Account): string {
  if (account.edition === 'central') {
    if (!account.organizationId) throw new Error('缺少 organizationId')
    return `/oapi/v1/codeup/organizations/${account.organizationId}`
  }
  return '/oapi/v1/codeup'
}

async function request<T>(
  account: Account,
  token: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
  // soft：可选增强接口失败时只抛短错误，避免控制台刷长中文（Windows 下还易乱码）
  options?: { soft?: boolean }
): Promise<{ data: T; headers: Headers }> {
  const url = new URL(`${baseUrl(account)}${orgPrefix(account)}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === '') continue
      url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-yunxiao-token': token
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (options?.soft) {
      throw new Error(`${res.status} ${body.includes('no permission') ? 'Forbidden' : res.statusText}`)
    }
    if (res.status === 403 || body.includes('no permission')) {
      throw new Error(
        `令牌无 API 权限（403）。请到云效「个人设置 → 个人访问令牌」删除后重建，` +
          `代码管理里至少将「代码仓库」「提交」设为只读；并确认账号选的是中心版还是 Region 版。` +
          ` 原始信息: ${body || res.statusText}`
      )
    }
    throw new Error(`Codeup API ${res.status}: ${body || res.statusText}`)
  }
  const data = (await res.json()) as T
  return { data, headers: res.headers }
}

function mapRepo(item: any, participating?: boolean): CodeupRepo {
  return {
    id: Number(item.id),
    name: String(item.name || ''),
    pathWithNamespace: String(
      item.pathWithNamespace || item.path_with_namespace || item.name || ''
    ),
    webUrl: String(item.webUrl || item.web_url || ''),
    lastActivityAt: item.lastActivityAt || item.last_activity_at,
    defaultBranch: item.defaultBranch || item.default_branch,
    accessLevel:
      item.accessLevel != null
        ? Number(item.accessLevel)
        : item.access_level != null
          ? Number(item.access_level)
          : undefined,
    visibility:
      item.visibility != null
        ? String(item.visibility)
        : item.visibility_level != null
          ? Number(item.visibility_level) === 0
            ? 'private'
            : 'internal'
          : undefined,
    starred: Boolean(item.starred || item.star),
    participating
  }
}

export async function testConnection(account: Account, token: string): Promise<{ repoCount: number }> {
  const { data, headers } = await request<CodeupRepo[]>(account, token, '/repositories', {
    page: 1,
    perPage: 1,
    archived: false
  })
  const total = Number(headers.get('x-total') || data.length || 0)
  return { repoCount: total }
}

export async function listAllRepositories(account: Account, token: string): Promise<CodeupRepo[]> {
  const all: CodeupRepo[] = []
  let page = 1
  const perPage = 100
  while (true) {
    const { data, headers } = await request<any[]>(account, token, '/repositories', {
      page,
      perPage,
      archived: false,
      orderBy: 'last_activity_at',
      sort: 'desc'
    })
    for (const item of data || []) {
      // OpenAPI 若带回 accessLevel，直接作为「我参与」初值
      const mapped = mapRepo(item)
      if ((mapped.accessLevel ?? 0) >= 20) mapped.participating = true
      all.push(mapped)
    }
    const totalPages = Number(headers.get('x-total-pages') || 1)
    if (page >= totalPages || !data?.length) break
    page++
  }

  await enrichParticipatingFlags(account, token, all)
  return all
}

/** 合并多路来源，补齐「我参与」标记 */
async function enrichParticipatingFlags(
  account: Account,
  token: string,
  repos: CodeupRepo[]
): Promise<void> {
  const ids = new Set<number>()

  // 1) 官方：当前用户有权限的资源（含直接加入的仓库）
  try {
    const fromUserResources = await listParticipatingIdsFromUserResources(account, token)
    for (const id of fromUserResources) ids.add(id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      '[codeup] user_resources skipped (optional):',
      /403|Forbidden/i.test(msg)
        ? 'token has no permission for this API; using heuristic'
        : msg
    )
  }

  // 2) 网页接口（需登录态；PAT 常返回 HTML，失败则跳过）
  try {
    const fromAuthorized = await listAuthorizedProjectIds(account, token)
    for (const id of fromAuthorized) ids.add(id)
  } catch (err) {
    console.warn(
      '[codeup] authorized/list skipped (optional):',
      err instanceof Error ? err.message : err
    )
  }

  if (ids.size > 0) {
    for (const repo of repos) {
      if (ids.has(repo.id)) repo.participating = true
      else if (repo.participating !== true) repo.participating = false
    }
  }

  const marked = repos.filter((r) => r.participating === true).length
  if (marked === 0) {
    console.warn('[codeup] participating empty, fallback heuristic')
    for (const repo of repos) {
      repo.participating = isParticipatingRepoHeuristic(repo)
    }
  }

  console.log(
    '[codeup] repos=',
    repos.length,
    'participating=',
    repos.filter((r) => r.participating).length,
    'extraIds=',
    ids.size
  )
}

/**
 * OpenAPI ListUserResources：
 * GET .../users/vision/user_resources
 */
async function listParticipatingIdsFromUserResources(
  account: Account,
  token: string
): Promise<Set<number>> {
  const ids = new Set<number>()
  let page = 1
  const perPage = 20

  while (true) {
    const { data, headers } = await request<any[]>(
      account,
      token,
      '/users/vision/user_resources',
      { page, per_page: perPage },
      { soft: true }
    )
    const rows = Array.isArray(data) ? data : []
    for (const row of rows) {
      for (const item of row?.repository_infos || row?.repositoryInfos || []) {
        const info = item?.repository_info || item?.repositoryInfo || item
        const id = Number(info?.id ?? item?.source_id ?? item?.sourceId)
        if (Number.isFinite(id)) ids.add(id)
        const roleLevel = Number(
          item?.role_info?.access_level ?? item?.roleInfo?.accessLevel ?? 0
        )
        if (roleLevel >= 20 && Number.isFinite(id)) ids.add(id)
      }
      // 组权限：仅记录组 id 不足以标仓库；role 挂在仓库上时上面已处理
      for (const item of row?.group_infos || row?.groupInfos || []) {
        const role = item?.role_info || item?.roleInfo
        if (role?.source_type === 'PROJECT' || role?.sourceType === 'PROJECT') {
          const id = Number(role.source_id ?? role.sourceId)
          if (Number.isFinite(id)) ids.add(id)
        }
      }
    }

    const totalPages = Number(headers.get('x-total-pages') || 1)
    if (page >= totalPages || rows.length === 0) break
    page++
    if (page > 50) break
  }

  console.log('[codeup] user_resources ids=', ids.size)
  return ids
}

function extractAuthorizedItems(json: any): any[] {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.result)) return json.result
  if (Array.isArray(json?.list)) return json.list
  if (Array.isArray(json?.projects)) return json.projects
  if (Array.isArray(json?.data?.list)) return json.data.list
  if (Array.isArray(json?.data?.result)) return json.data.result
  return []
}

/**
 * 网页「我参与的」接口（依赖浏览器登录态；PAT 可能无效）：
 * GET https://codeup.aliyun.com/api/v3/projects/authorized/list
 */
export async function listAuthorizedProjectIds(
  account: Account,
  token: string
): Promise<Set<number>> {
  const ids = new Set<number>()
  let page = 1
  const perPage = 100

  while (true) {
    const url = new URL('https://codeup.aliyun.com/api/v3/projects/authorized/list')
    url.searchParams.set('_input_charset', 'utf-8')
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))
    url.searchParams.set('order_by', 'last_activity_at')
    url.searchParams.set('archived', 'false')
    url.searchParams.set('contains_sub_projects', 'true')
    if (account.organizationId) {
      url.searchParams.set('organizationId', account.organizationId)
      url.searchParams.set('organization_id', account.organizationId)
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Private-Token': token,
        'x-yunxiao-token': token,
        ...(account.organizationId
          ? {
              'x-organization-id': account.organizationId,
              'x-org-id': account.organizationId
            }
          : {})
      }
    })

    const raw = await res.text()
    const trimmed = raw.trim()
    // 未登录时常返回 HTML 登录页（HTTP 仍可能是 200）
    if (
      !res.ok ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<')
    ) {
      throw new Error(
        `authorized/list 非 JSON（status=${res.status}，疑似需网页登录态，已跳过）`
      )
    }

    let json: any
    try {
      json = JSON.parse(raw)
    } catch {
      throw new Error('authorized/list JSON 解析失败')
    }

    const items = extractAuthorizedItems(json)
    for (const item of items) {
      const id = Number(item.id ?? item.projectId ?? item.project_id ?? item.repositoryId)
      if (!Number.isFinite(id)) continue
      ids.add(id)
    }

    const total = Number(res.headers.get('x-total') || json?.total || json?.count || 0)
    const totalPages = Number(
      res.headers.get('x-total-pages') || (total > 0 ? Math.ceil(total / perPage) : 0)
    )
    if (items.length === 0) break
    if (totalPages > 0 && page >= totalPages) break
    if (items.length < perPage) break
    page++
    if (page > 50) break
  }

  console.log('[codeup] authorized ids=', ids.size)
  return ids
}

/** 仅在 authorized/list 不可用时的降级启发式 */
export function isParticipatingRepoHeuristic(repo: CodeupRepo): boolean {
  if (repo.participating) return true
  if (repo.starred) return true
  if ((repo.accessLevel ?? 0) >= 20) return true
  if (repo.visibility === 'private') return true
  return false
}

export function isParticipatingRepo(repo: CodeupRepo): boolean {
  if (repo.participating === true) return true
  if (repo.participating === false) return false
  return isParticipatingRepoHeuristic(repo)
}

export interface CodeupBranch {
  name: string
  defaultBranch?: boolean
  protected?: boolean
}

/** 查询仓库分支列表 */
export async function listBranches(
  account: Account,
  token: string,
  repositoryId: number | string,
  search?: string
): Promise<CodeupBranch[]> {
  const all: CodeupBranch[] = []
  let page = 1
  const perPage = 100
  while (true) {
    const { data, headers } = await request<any[]>(
      account,
      token,
      `/repositories/${repositoryId}/branches`,
      {
        page,
        perPage,
        sort: 'name_asc',
        search: search || undefined
      }
    )
    for (const item of data || []) {
      const name = String(item.name || '')
      if (!name) continue
      all.push({
        name,
        defaultBranch: Boolean(item.defaultBranch),
        protected: Boolean(item.protected)
      })
    }
    const totalPages = Number(headers.get('x-total-pages') || 1)
    if (page >= totalPages || !data?.length) break
    page++
    if (page > 20) break
  }
  return all
}

export async function listCommitsSince(
  account: Account,
  token: string,
  repositoryId: number | string,
  refName: string,
  since?: string
): Promise<CodeupCommit[]> {
  const all: CodeupCommit[] = []
  let page = 1
  const perPage = 100
  while (true) {
    const { data, headers } = await request<any[]>(
      account,
      token,
      `/repositories/${repositoryId}/commits`,
      {
        refName,
        since,
        page,
        perPage
      }
    )
    for (const item of data || []) {
      // message 为完整提交说明；title 仅为首行
      const message = String(item.message || item.commitMessage || '')
      const title = String(
        item.title || message.split('\n').find((l) => l.trim()) || ''
      )
      all.push({
        id: String(item.id),
        shortId: String(item.shortId || String(item.id).slice(0, 8)),
        title,
        message: message || title,
        authorName: String(item.authorName || ''),
        authorEmail: String(item.authorEmail || ''),
        authoredDate: String(item.authoredDate || item.committedDate || ''),
        committedDate: String(item.committedDate || item.authoredDate || ''),
        committerName: String(item.committerName || ''),
        committerEmail: String(item.committerEmail || ''),
        webUrl: String(item.webUrl || ''),
        parentIds: item.parentIds
      })
    }
    const totalPages = Number(headers.get('x-total-pages') || 1)
    if (page >= totalPages || !data?.length) break
    page++
    if (page > 50) break
  }
  return all
}
