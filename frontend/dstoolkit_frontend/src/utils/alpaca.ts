import type { ParsedConversation } from '@/types'

export interface AlpacaItem {
  instruction: string
  input: string
  output: string
}

export interface AlpacaMultiItem {
  conversations: Array<{ role: 'user' | 'assistant'; content: string }>
}

export function toAlpacaSingle(convs: ParsedConversation[]): AlpacaItem[] {
  const out: AlpacaItem[] = []
  for (const c of convs) {
    const msgs = c.messages
    for (let i = 0; i + 1 < msgs.length; i++) {
      const cur = msgs[i]
      const next = msgs[i + 1]
      if (cur && next && cur.role === 'USER' && next.role === 'ASSISTANT') {
        out.push({ instruction: cur.content, input: '', output: next.content })
      }
    }
  }
  return out
}

export function toAlpacaMulti(convs: ParsedConversation[]): AlpacaMultiItem[] {
  return convs.map((c) => ({
    conversations: c.messages.map((m) => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
  }))
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
