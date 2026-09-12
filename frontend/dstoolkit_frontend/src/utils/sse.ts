/**
 * SSE 流式请求工具：用于续聊 / Agent 对话的流式输出。
 * 与后端 text/event-stream 响应配合，逐段回调 onDelta。
 */
export async function ssePost(
  url: string,
  body: Record<string, unknown>,
  opts: {
    onDelta?: (delta: string) => void
    onDone?: (data: any) => void
    onError?: (err: Error) => void
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const token = localStorage.getItem('dstoolkit_token')
  // 本项目接口统一挂在 /api 前缀下（见 utils/request.ts 的 baseURL）。
  // 本函数用裸 fetch，不经过 axios，需自行补前缀，否则请求会落到 SPA 静态兜底被 nginx 以 405 拒绝。
  const fullUrl = /^https?:\/\//i.test(url) || url.startsWith('/api') ? url : `/api${url}`
  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = `请求失败 (${res.status})`
      try {
        const json = JSON.parse(text)
        msg = json.error || msg
      } catch {
        msg = text || msg
      }
      throw new Error(msg)
    }

    if (!res.body) throw new Error('响应为空')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const event of events) {
        const lines = event.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data) continue
          try {
            const json = JSON.parse(data)
            if (json.error) {
              opts.onError?.(new Error(json.error))
              return
            }
            if (json.delta) {
              opts.onDelta?.(json.delta)
            }
            if (json.done) {
              opts.onDone?.(json)
            }
          } catch {
            // 忽略非 JSON
          }
        }
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    opts.onError?.(e)
  }
}
