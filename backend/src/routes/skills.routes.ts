import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'

const router = Router()
router.use(verifyJwt)

// GET /api/skills  列出我的技能
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const skills = await prisma.skill.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      tags: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  res.json({ skills })
}))

// GET /api/skills/:id  获取技能详情（含 content）
router.get('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const skill = await prisma.skill.findFirst({
    where: { id, userId: req.user!.id },
  })
  if (!skill) return res.status(404).json({ error: '技能不存在' })
  res.json({ skill })
}))

// POST /api/skills  创建技能
const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误', details: parsed.error.flatten() })

  const { name, description, content, tags, enabled } = parsed.data
  try {
    const skill = await prisma.skill.create({
      data: {
        userId: req.user!.id,
        name,
        description: description || null,
        content,
        tags: tags || [],
        enabled: enabled ?? true,
      },
    })
    res.json({ skill })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: '同名技能已存在' })
    }
    throw e
  }
}))

// PUT /api/skills/:id  更新技能
router.put('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const skill = await prisma.skill.findFirst({ where: { id, userId: req.user!.id } })
  if (!skill) return res.status(404).json({ error: '技能不存在' })

  const { name, description, content, tags, enabled } = req.body as any
  const data: any = {}
  if (typeof name === 'string') data.name = name
  if (typeof description === 'string') data.description = description
  if (typeof content === 'string') data.content = content
  if (Array.isArray(tags)) data.tags = tags
  if (typeof enabled === 'boolean') data.enabled = enabled

  try {
    const updated = await prisma.skill.update({ where: { id }, data })
    res.json({ skill: updated })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: '同名技能已存在' })
    }
    throw e
  }
}))

// DELETE /api/skills/:id  删除技能
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const skill = await prisma.skill.findFirst({ where: { id, userId: req.user!.id } })
  if (!skill) return res.status(404).json({ error: '技能不存在' })
  await prisma.skill.delete({ where: { id } })
  res.json({ ok: true })
}))

export default router
