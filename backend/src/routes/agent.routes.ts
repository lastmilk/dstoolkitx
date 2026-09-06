import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { env } from '../config/env.js'
import { tryConsumeCredits } from '../utils/quota.js'
import { STEPFUN_MODELS } from '../services/aiClient.js'
import { runAgent } from '../services/agentService.js'
import {
  appendMessages,
  createUnifiedConversation,
  listUserConversations,
  loadConversationForAI,
} from '../services/unifiedConversationService.js'

const router = Router()
router.use(verifyJwt)

// GET /api/agent  列出 Agent 对话
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 50
  const result = await listUserConversations(req.user!.id, {
    page,
    pageSize,
    source: 'AGENT',
  })
  res.json(result)
}))

// POST /api/agent  新建 Agent 对话
const createSchema = z.object({
  title: z.string().min(1).max(200),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1),
  model: z
    .enum([STEPFUN_MODELS.step1o, STEPFUN_MODELS.step1oFlash, STEPFUN_MODELS.step1v])
    .default(STEPFUN_MODELS.step1o),
})

router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误', details: parsed.error.flatten() })

  const { title, messages, model } = parsed.data
  const conv = await createUnifiedConversation({
    userId: req.user!.id,
    title,
    source: 'AGENT',
    model,
    messages: messages.map((m) => ({
      role: m.role.toUpperCase() as any,
      content: m.content,
      model,
    })),
  })
  res.json({ conversation: conv })
}))

// GET /api/agent/:id  获取 Agent 对话详情
router.get('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const conv = await prisma.unifiedConversation.findFirst({
    where: { id, userId: req.user!.id },
    include: { messages: { orderBy: { insertedAt: 'asc' } } },
  })
  if (!conv) return res.status(404).json({ error: '对话不存在' })
  res.json({ conversation: conv })
}))

// POST /api/agent/:id/message  发送 Agent 消息（SSE 流式，消耗积分）
router.post('/:id/message', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const { content, model } = req.body as { content?: string; model?: string }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: '请输入消息内容' })
  }

  const conv = await prisma.unifiedConversation.findFirst({
    where: { id, userId: req.user!.id },
  })
  if (!conv) return res.status(404).json({ error: '对话不存在' })

  // 额度限制：消耗 AI 积分
  const creditResult = await tryConsumeCredits(
    req.user!.id,
    'AGENT_CHAT',
    env.agentChatCreditCost,
    `Agent 续聊对话 #${id}`,
  )
  if (!creditResult.ok) {
    return res.status(402).json({
      error: `AI 积分不足：需要 ${creditResult.needed}，当前余额 ${creditResult.balance}`,
      needed: creditResult.needed,
      balance: creditResult.balance,
      upgradeHint: true,
    })
  }

  const useModel = model || conv.model || STEPFUN_MODELS.step1o

  // 加载历史消息
  const { messages } = await loadConversationForAI(id)
  messages.push({ role: 'user', content })

  // SSE 响应
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let fullContent = ''
  let toolCalls = 0
  try {
    const result = await runAgent({
      userId: req.user!.id,
      messages,
      model: useModel,
      onDelta: (delta) => {
        fullContent += delta
        res.write(`data: ${JSON.stringify({ delta })}\n\n`)
      },
    })
    fullContent = result.content || fullContent
    toolCalls = result.toolCalls

    // 持久化
    await appendMessages(id, [
      { role: 'USER', content, model: useModel },
      { role: 'ASSISTANT', content: fullContent, model: result.model },
    ])

    res.write(
      `data: ${JSON.stringify({ done: true, model: result.model, toolCalls, balance: creditResult.balance })}\n\n`,
    )
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e?.message || 'Agent 调用失败' })}\n\n`)
  } finally {
    res.end()
  }
}))

export default router
