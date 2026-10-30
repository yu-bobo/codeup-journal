export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  // 毫秒，默认 120s
  timeoutMs?: number
}

function joinChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

/**
 * 调用 OpenAI 兼容的 chat/completions 接口
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const url = joinChatUrl(opts.baseUrl)
  const timeoutMs = opts.timeoutMs ?? 120_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: 0.4
      }),
      signal: controller.signal
    })

    const text = await res.text()
    let data: {
      error?: { message?: string }
      choices?: { message?: { content?: string } }[]
    }
    try {
      data = JSON.parse(text) as typeof data
    } catch {
      throw new Error(
        res.ok
          ? `模型返回非 JSON：${text.slice(0, 200)}`
          : `模型请求失败 HTTP ${res.status}：${text.slice(0, 200)}`
      )
    }

    if (!res.ok) {
      const msg = data.error?.message || text.slice(0, 200) || `HTTP ${res.status}`
      throw new Error(`模型请求失败：${msg}`)
    }

    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('模型未返回有效内容')
    return content
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`模型请求超时（${Math.round(timeoutMs / 1000)}s）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
