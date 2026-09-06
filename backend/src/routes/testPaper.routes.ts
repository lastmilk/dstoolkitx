import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { generateTestPaper, saveTestPaper } from '../services/testPaperService.js'
import { submitJob, getJobStatus } from '../services/queue.js'
import { AI_CREDIT_COSTS, tryConsumeCredits } from '../utils/quota.js'
import type { QuestionType } from '@prisma/client'

const router = Router()
router.use(verifyJwt)

const VALID_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'SHORT_ANSWER',
]

// GET /api/test-papers  列出我的试卷
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 20
  const where = { userId: req.user!.id }
  const [papers, total] = await Promise.all([
    prisma.testPaper.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        subject: true,
        difficulty: true,
        questionCount: true,
        totalScore: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.testPaper.count({ where }),
  ])
  res.json({ papers, total, page, pageSize })
}))

// POST /api/test-papers/generate  生成试卷（异步任务，消耗积分）
const generateSchema = z.object({
  requirement: z.string().min(1).max(2000),
  questionCount: z.number().int().min(1).max(50).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  types: z.array(z.enum(VALID_TYPES as any)).optional(),
  conversationIds: z.array(z.number().int()).optional(),
  keywords: z.array(z.string()).optional(),
})

router.post('/generate', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误', details: parsed.error.flatten() })

  const { requirement, questionCount, difficulty, types, conversationIds, keywords } = parsed.data

  // 消耗积分
  const cost = AI_CREDIT_COSTS.SUMMARY // 复用摘要积分成本
  const creditResult = await tryConsumeCredits(
    req.user!.id,
    'TEST_PAPER',
    cost,
    `生成试卷：${requirement.slice(0, 30)}`,
  )
  if (!creditResult.ok) {
    return res.status(402).json({
      error: `AI 积分不足：需要 ${creditResult.needed}，当前余额 ${creditResult.balance}`,
      needed: creditResult.needed,
      balance: creditResult.balance,
      upgradeHint: true,
    })
  }

  // 创建占位试卷（GENERATING 状态）
  const placeholder = await prisma.testPaper.create({
    data: {
      userId: req.user!.id,
      title: '生成中...',
      difficulty: difficulty || 'medium',
      status: 'GENERATING',
      scope: { conversationIds, keywords } as any,
    },
    select: { id: true },
  })

  // 提交异步任务
  const jobId = submitJob('test-paper', async () => {
    try {
      const paper = await generateTestPaper(req.user!.id, requirement, {
        questionCount,
        difficulty,
        types,
      })
      const paperId = await saveTestPaper(req.user!.id, paper, { conversationIds, keywords })
      // 删除占位
      await prisma.testPaper.delete({ where: { id: placeholder.id } }).catch(() => {})
      return { paperId }
    } catch (e: any) {
      // 标记失败
      await prisma.testPaper.update({
        where: { id: placeholder.id },
        data: { status: 'FAILED', errorMessage: e?.message || '生成失败' },
      })
      throw e
    }
  })

  res.json({ jobId, placeholderId: placeholder.id, message: '试卷生成中，请稍候' })
}))

// GET /api/test-papers/job/:jobId  查询生成任务状态
router.get('/job/:jobId', asyncHandler(async (req: AuthedRequest, res) => {
  const job = getJobStatus(req.params.jobId)
  if (!job) return res.status(404).json({ error: '任务不存在或已过期' })
  res.json(job)
}))

// GET /api/test-papers/:id  获取试卷详情（含题目与答案）
router.get('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const paper = await prisma.testPaper.findFirst({
    where: { id, userId: req.user!.id },
    include: {
      questions: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          orderIndex: true,
          type: true,
          content: true,
          options: true,
          answer: true,
          explanation: true,
          score: true,
          sourceConvId: true,
          sourceSnippet: true,
        },
      },
    },
  })
  if (!paper) return res.status(404).json({ error: '试卷不存在' })
  res.json({ paper })
}))

// DELETE /api/test-papers/:id  删除试卷
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const paper = await prisma.testPaper.findFirst({ where: { id, userId: req.user!.id } })
  if (!paper) return res.status(404).json({ error: '试卷不存在' })
  await prisma.testPaper.delete({ where: { id } })
  res.json({ ok: true })
}))

export default router
