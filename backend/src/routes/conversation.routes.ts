import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'

const router = Router()
router.use(verifyJwt)

// GET /api/conversations?configId=&q=  服务端搜索（cloud=true 时可用）
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const configId = req.query.configId ? Number(req.query.configId) : undefined
  const q = String(req.query.q || '').trim()
  const where: any = {}
  if (configId) {
    const config = await prisma.deepseekConfig.findFirst({ where: { id: configId, userId: req.user!.id } })
    if (!config) return res.status(404).json({ error: '配置不存在' })
    where.configId = configId
  } else {
    where.config = { userId: req.user!.id }
  }
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { messages: { some: { content: { contains: q } } } },
    ]
  }
  const conversations = await prisma.conversation.findMany({
    where,
    select: {
      id: true,
      deepseekConvId: true,
      title: true,
      insertedAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
    orderBy: { insertedAt: 'desc' },
    take: 200,
  })
  return res.json({ conversations })
}))

export default router
