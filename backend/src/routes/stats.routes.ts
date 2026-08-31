import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'

const router = Router()
router.use(verifyJwt)

function cnParts(d: Date) {
  const u = new Date(d.getTime() + 8 * 3600 * 1000)
  return { date: u.toISOString().slice(0, 10), hour: u.getUTCHours() }
}

router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const configId = req.query.configId ? Number(req.query.configId) : undefined
  const convWhere: any = configId
    ? { configId, config: { userId: req.user!.id } }
    : { config: { userId: req.user!.id } }

  const convs = await prisma.conversation.findMany({
    where: convWhere,
    select: { insertedAt: true },
    take: 10000,
  })
  const msgs = await prisma.message.findMany({
    where: { conversation: convWhere },
    select: { insertedAt: true, role: true, model: true },
    take: 100000,
  })

  const dailyConv = new Map<string, number>()
  for (const c of convs) {
    const k = cnParts(c.insertedAt).date
    dailyConv.set(k, (dailyConv.get(k) || 0) + 1)
  }
  const dailyMsg = new Map<string, { date: string; user: number; assistant: number }>()
  for (const m of msgs) {
    const k = cnParts(m.insertedAt).date
    const cur = dailyMsg.get(k) || { date: k, user: 0, assistant: 0 }
    if (m.role === 'USER') cur.user++
    else cur.assistant++
    dailyMsg.set(k, cur)
  }
  const modelDist = new Map<string, number>()
  for (const m of msgs) {
    if (m.model) modelDist.set(m.model, (modelDist.get(m.model) || 0) + 1)
  }
  const hours = new Array(24).fill(0)
  for (const m of msgs) hours[cnParts(m.insertedAt).hour]++

  return res.json({
    totalConversations: convs.length,
    totalMessages: msgs.length,
    dailyConversations: Array.from(dailyConv.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    dailyMessages: Array.from(dailyMsg.values()).sort((a, b) => a.date.localeCompare(b.date)),
    modelDistribution: Array.from(modelDist.entries()).map(([model, count]) => ({ model, count })),
    activeHours: hours.map((count, hour) => ({ hour, count })),
  })
}))

export default router
