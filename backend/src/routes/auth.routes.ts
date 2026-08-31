import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { hashPassword, comparePassword } from '../utils/crypto.js'
import { signToken } from '../utils/token.js'

const router = Router()

const registerSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(6).max(128),
})

// 注册：首个用户自动为 ADMIN，便于初始化后台
router.post('/register', asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '用户名至少 2 位，密码至少 6 位' })
  const { username, password } = parsed.data
  const exists = await prisma.user.findUnique({ where: { username } })
  if (exists) return res.status(409).json({ error: '用户名已存在' })
  const userCount = await prisma.user.count()
  const role = userCount === 0 ? 'ADMIN' : 'USER'
  const created = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), role },
  })
  const token = signToken({ sub: created.id, username: created.username, role: created.role })
  return res.json({
    token,
    user: { id: created.id, username: created.username, role: created.role, cloudSyncEnabled: created.cloudSyncEnabled },
  })
}))

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误' })
  const { username, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return res.status(401).json({ error: '用户名或密码错误' })
  const ok = await comparePassword(password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: '用户名或密码错误' })
  const token = signToken({ sub: user.id, username: user.username, role: user.role })
  return res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, cloudSyncEnabled: user.cloudSyncEnabled },
  })
}))

router.get('/me', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: {
      id: true,
      username: true,
      role: true,
      cloudSyncEnabled: true,
      createdAt: true,
      tier: true,
      tierExpiresAt: true,
      isPermanentTier: true,
      aiCredits: true,
      referralCode: true,
    },
  })
  return res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      cloudSyncEnabled: user.cloudSyncEnabled,
      createdAt: user.createdAt,
      tier: user.tier,
      tierExpiresAt: user.tierExpiresAt,
      isPermanentTier: user.isPermanentTier,
      aiCredits: user.aiCredits,
      referralCode: user.referralCode,
    },
  })
}))

const profileSchema = z.object({ username: z.string().min(2).max(32) })

router.put('/profile', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '用户名至少 2 位' })
  const username = parsed.data.username
  const taken = await prisma.user.findUnique({ where: { username } })
  if (taken && taken.id !== req.user!.id) return res.status(409).json({ error: '用户名已被占用' })
  await prisma.user.update({ where: { id: req.user!.id }, data: { username } })
  return res.json({ ok: true })
}))

const passwordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
})

router.put('/password', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = passwordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误' })
  const { oldPassword, newPassword } = parsed.data
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  const ok = await comparePassword(oldPassword, user.passwordHash)
  if (!ok) return res.status(401).json({ error: '原密码错误' })
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } })
  return res.json({ ok: true })
}))

const cloudSchema = z.object({ enabled: z.boolean() })

router.put('/cloud-sync', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = cloudSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误' })
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { cloudSyncEnabled: parsed.data.enabled },
  })
  return res.json({ cloudSyncEnabled: updated.cloudSyncEnabled })
}))

export default router
