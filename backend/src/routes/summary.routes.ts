import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { AI_CREDIT_COSTS, tryConsumeCredits, TIER_LIMITS } from '../utils/quota.js'
import { resolveEffectiveTier } from '../services/subscription.js'
import { generateSummary, saveSummary } from '../services/aiSummary.js'
import { submitJob, getJobStatus } from '../services/queue.js'

const router = Router()
router.use(verifyJwt)

/** 验证对话归属当前用户 */
async function verifyConversationOwnership(
  conversationId: number,
  userId: number,
): Promise<number> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { config: { select: { userId: true } } },
  })
  if (!conv || conv.config.userId !== userId) {
    throw Object.assign(new Error('对话不存在或无权访问'), { status: 404 })
  }
  return conversationId
}

// POST /api/summaries/:conversationId  生成 AI 摘要 + 知识卡片（异步任务）
router.post('/:conversationId', asyncHandler(async (req: AuthedRequest, res) => {
  const conversationId = Number(req.params.conversationId)
  await verifyConversationOwnership(conversationId, req.user!.id)

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { tier: true, tierExpiresAt: true, isPermanentTier: true, aiCredits: true },
  })
  const effectiveTier = resolveEffectiveTier(user)
  const limits = TIER_LIMITS[effectiveTier]

  // FREE 用户每日 5 次免费摘要（不消耗积分）
  let cost = AI_CREDIT_COSTS.SUMMARY
  let freeTrial = false
  if (effectiveTier === 'FREE') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCount = await prisma.quotaLedger.count({
      where: {
        userId: req.user!.id,
        action: 'SUMMARY_FREE',
        createdAt: { gte: today },
      },
    })
    if (todayCount < 5) {
      cost = 0
      freeTrial = true
    }
  }

  // 消耗积分（免费试用除外）
  if (cost > 0) {
    const result = await tryConsumeCredits(req.user!.id, 'SUMMARY', cost, `对话 #${conversationId} 摘要`)
    if (!result.ok) {
      return res.status(402).json({
        error: `AI 积分不足：需要 ${result.needed}，当前余额 ${result.balance}，请购买充值包`,
        needed: result.needed,
        balance: result.balance,
        upgradeHint: true,
      })
    }
  } else if (freeTrial) {
    // 记录免费试用次数
    await prisma.quotaLedger.create({
      data: {
        userId: req.user!.id,
        action: 'SUMMARY_FREE',
        delta: 0,
        balance: user.aiCredits,
        detail: `对话 #${conversationId} 免费摘要`,
      },
    })
  }

  // 提交异步任务
  const jobId = submitJob('summary', async () => {
    const result = await generateSummary(conversationId, req.user!.id)
    await saveSummary(conversationId, req.user!.id, result, 'deepseek-chat')
    return result
  })

  res.json({ jobId, message: 'AI 摘要生成中，请稍候' })
}))

// GET /api/summaries/job/:jobId  查询任务状态
router.get('/job/:jobId', asyncHandler(async (req: AuthedRequest, res) => {
  const job = getJobStatus(req.params.jobId)
  if (!job) return res.status(404).json({ error: '任务不存在或已过期' })
  res.json(job)
}))

// GET /api/summaries/:conversationId  获取对话摘要
router.get('/:conversationId', asyncHandler(async (req: AuthedRequest, res) => {
  const conversationId = Number(req.params.conversationId)
  await verifyConversationOwnership(conversationId, req.user!.id)

  const summary = await prisma.convSummary.findUnique({
    where: { conversationId },
    select: {
      id: true,
      tldr: true,
      summary: true,
      tags: true,
      confidence: true,
      model: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  res.json({ summary })
}))

// GET /api/summaries/cards/:conversationId  获取对话的知识卡片
router.get('/cards/:conversationId', asyncHandler(async (req: AuthedRequest, res) => {
  const conversationId = Number(req.params.conversationId)
  await verifyConversationOwnership(conversationId, req.user!.id)

  const cards = await prisma.knowledgeCard.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      sourceNodeId: true,
      createdAt: true,
    },
  })
  res.json({ cards })
}))

// GET /api/summaries/cards  跨对话搜索知识卡片
router.get('/cards', asyncHandler(async (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim()
  const where: any = { userId: req.user!.id }
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { content: { contains: q } },
    ]
  }
  const cards = await prisma.knowledgeCard.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      conversationId: true,
      conversation: { select: { title: true, deepseekConvId: true } },
      createdAt: true,
    },
  })
  res.json({ cards })
}))

export default router
