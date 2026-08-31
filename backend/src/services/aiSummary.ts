import { env } from '../config/env.js'
import { prisma } from '../utils/prisma.js'

interface DeepseekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string } }>
}

/** 调用 DeepSeek Chat Completions API（OpenAI 兼容） */
async function callDeepseek(
  messages: DeepseekMessage[],
  opts?: { json?: boolean; model?: string },
): Promise<string> {
  const key = env.deepseekServerKey
  if (!key) {
    throw new Error('服务端未配置 DEEPSEEK_SERVER_API_KEY，无法执行 AI 操作')
  }
  const body: Record<string, unknown> = {
    model: opts?.model || 'deepseek-chat',
    messages,
    temperature: 0.3,
    max_tokens: 4096,
  }
  if (opts?.json) {
    body.response_format = { type: 'json_object' }
  }
  const res = await fetch(`${env.deepseekApiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek API 错误 (${res.status}): ${text || res.statusText}`)
  }
  const data = (await res.json()) as ChatCompletionResponse
  return data.choices?.[0]?.message?.content || ''
}

/** 获取对话的文本内容（截断到合理长度以控制 token） */
async function getConversationText(conversationId: number, maxChars = 12000): Promise<{
  title: string
  text: string
  messageCount: number
}> {
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { insertedAt: 'asc' },
        select: { role: true, content: true, nodeId: true },
      },
    },
  })
  const parts: string[] = []
  for (const m of conv.messages) {
    const role = m.role === 'USER' ? '用户' : 'AI'
    parts.push(`【${role}】${m.content}`)
    if (parts.join('\n').length > maxChars) break
  }
  return {
    title: conv.title,
    text: parts.join('\n').slice(0, maxChars),
    messageCount: conv.messages.length,
  }
}

export interface SummaryResult {
  tldr: string
  summary: string
  tags: string[]
  knowledgeCards: Array<{
    title: string
    content: string
    category: string
    tags: string[]
  }>
  confidence: number
}

/**
 * 为一段对话生成 AI 摘要 + 知识卡片。
 * 调用 DeepSeek，返回结构化 JSON。
 */
export async function generateSummary(conversationId: number, userId: number): Promise<SummaryResult> {
  const { title, text, messageCount } = await getConversationText(conversationId)
  if (!text.trim()) {
    throw new Error('对话内容为空，无法生成摘要')
  }

  const systemPrompt = `你是一个对话分析助手。请分析以下 AI 对话，生成摘要和知识卡片。严格返回 JSON 格式：
{
  "tldr": "一句话摘要（不超过50字）",
  "summary": "详细摘要（200-400字，包含核心问题和解决方案）",
  "tags": ["标签1","标签2","标签3"],
  "knowledgeCards": [
    {"title":"卡片标题","content":"知识点内容","category":"分类","tags":["标签"]}
  ],
  "confidence": 0.85
}
要求：
- tags 3-5 个，简洁（如 "React"、"性能优化"、"面试"）
- knowledgeCards 0-5 张，提取可复用的知识点
- confidence 0-1，对话越清晰越高`

  const userPrompt = `对话标题：${title}\n消息数：${messageCount}\n\n对话内容：\n${text}`

  const raw = await callDeepseek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { json: true },
  )

  let parsed: SummaryResult
  try {
    parsed = JSON.parse(raw) as SummaryResult
  } catch {
    // 尝试提取 JSON 部分
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      parsed = JSON.parse(match[0]) as SummaryResult
    } else {
      throw new Error('AI 返回格式异常，无法解析')
    }
  }

  // 兜底默认值
  parsed.tldr = parsed.tldr || title.slice(0, 50)
  parsed.summary = parsed.summary || '摘要生成失败，请查看原文'
  parsed.tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : []
  parsed.knowledgeCards = Array.isArray(parsed.knowledgeCards) ? parsed.knowledgeCards : []
  parsed.confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.8

  return parsed
}

/**
 * 将生成的摘要持久化到数据库。
 * upsert：同一对话重复生成会覆盖。
 */
export async function saveSummary(
  conversationId: number,
  userId: number,
  result: SummaryResult,
  model?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 删除旧的知识卡片
    await tx.knowledgeCard.deleteMany({ where: { conversationId } })
    // upsert 摘要
    await tx.convSummary.upsert({
      where: { conversationId },
      create: {
        conversationId,
        userId,
        tldr: result.tldr,
        summary: result.summary,
        tags: result.tags,
        confidence: result.confidence,
        model,
      },
      update: {
        tldr: result.tldr,
        summary: result.summary,
        tags: result.tags,
        confidence: result.confidence,
        model,
      },
    })
    // 插入新知识卡片
    if (result.knowledgeCards.length > 0) {
      await tx.knowledgeCard.createMany({
        data: result.knowledgeCards.map((c) => ({
          conversationId,
          userId,
          title: c.title,
          content: c.content,
          category: c.category || '通用',
          tags: c.tags || [],
        })),
      })
    }
  })
}
