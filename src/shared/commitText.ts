/**
 * 取完整提交说明：优先 message，否则回退 title
 */
export function commitFullText(commit: { title?: string; message?: string }): string {
  const message = (commit.message || '').trim()
  const title = (commit.title || '').trim()
  if (message) return message
  return title
}

/**
 * 取提交说明首行：优先 title，否则从完整说明拆出第一行
 */
export function commitTitleLine(commit: { title?: string; message?: string }): string {
  const title = (commit.title || '').trim()
  if (title) {
    return title.split('\n').find((l) => l.trim())?.trim() || title
  }
  const full = commitFullText(commit)
  return full.split('\n').find((l) => l.trim())?.trim() || full
}
