import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { generateApiToken, hashToken, maskToken, TOKEN_PREFIX } from '../utils/apitoken.js'

const router = Router()
router.use(verifyJwt)

const MS_PER_DAY = 24 * 60 * 60 * 1000

// GET /api/tokens  列出当前用户的访问令牌（不返回明文）
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const tokens = await prisma.apiToken.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  })
  return res.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      masked: `${t.prefix}****`,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
    })),
  })
}))

const createSchema = z.object({
  name: z.string().min(1).max(64),
  expiresInDays: z.number().int().positive().max(3650).optional(),
})

// POST /api/tokens  创建令牌，明文仅此一次返回
router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误：name 必填，expiresInDays 可选（1-3650）' })
  const { name, expiresInDays } = parsed.data
  const plain = generateApiToken()
  const tokenHash = hashToken(plain)
  const prefix = plain.slice(0, 10) // dstk_xxxx
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * MS_PER_DAY) : null
  try {
    const created = await prisma.apiToken.create({
      data: { userId: req.user!.id, name, tokenHash, prefix, expiresAt },
    })
    return res.status(201).json({
      id: created.id,
      name: created.name,
      token: plain, // 明文仅此一次返回，请客户端立即保存
      prefix: created.prefix,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    })
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: '令牌冲突，请重试' })
    throw e
  }
}))

// DELETE /api/tokens/:id  删除自己的令牌
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const t = await prisma.apiToken.findFirst({ where: { id, userId: req.user!.id } })
  if (!t) return res.status(404).json({ error: '令牌不存在' })
  await prisma.apiToken.delete({ where: { id } })
  return res.json({ ok: true })
}))

export { TOKEN_PREFIX, maskToken }
export default router
