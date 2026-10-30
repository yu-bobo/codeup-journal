/**
 * 展示用仓库路径：去掉前缀企业/组织 ID，避免下拉框被撑满看不清
 */
export function shortRepoPath(
  pathWithNamespace: string | undefined | null,
  organizationId?: string
): string {
  const raw = (pathWithNamespace || '').trim()
  if (!raw) return ''
  const parts = raw.split('/').filter(Boolean)
  if (parts.length <= 1) return raw

  if (organizationId && parts[0] === organizationId) {
    return parts.slice(1).join('/')
  }
  // 中心版常见：首段为 24 位 hex 组织 ID
  if (/^[a-f0-9]{24}$/i.test(parts[0])) {
    return parts.slice(1).join('/') || raw
  }
  return raw
}
