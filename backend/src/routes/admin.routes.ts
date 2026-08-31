import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, requireAdmin, type AuthedRequest } from '../middleware/auth.js'
import { decryptApiKey, maskApiKey } from '../utils/crypto.js'
import { parsePaging, pageResponse } from '../utils/paging.js'

const router = Router()
router.use(verifyJwt, requireAdmin)

// GET /api/admin/users?page=&pageSize=&username=
router.get('/users', asyncHandler(async (req: AuthedRequest, res) => {
  const { page, pageSize } = parsePaging(req)
  const username = req.query.username ? String(req.query.username) : undefined
  const where = username ? { username: { contains: username } } : {}
  const [records, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, username: true, role: true, cloudSyncEnabled: true, createdAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ])
  return res.json(pageResponse(records, { page, pageSize, total }))
}))

const roleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) })

// PATCH /api/admin/users/:id
router.patch('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const parsed = roleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误' })
  const updated = await prisma.user.update({ where: { id }, data: { role: parsed.data.role } })
  return res.json({ user: { id: updated.id, username: updated.username, role: updated.role } })
}))

// GET /api/admin/configs?page=&pageSize=&name=
router.get('/configs', asyncHandler(async (req: AuthedRequest, res) => {
  const { page, pageSize } = parsePaging(req)
  const name = req.query.name ? String(req.query.name) : undefined
  const where = name ? { name: { contains: name } } : {}
  const [records, total] = await Promise.all([
    prisma.deepseekConfig.findMany({
      where,
      include: {
        user: { select: { id: true, username: true } },
        _count: { select: { conversations: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.deepseekConfig.count({ where }),
  ])
  return res.json(pageResponse(records, { page, pageSize, total }))
}))

// GET /api/admin/conversations?configId=&page=&pageSize=&title=
router.get('/conversations', asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePaging(req)
  const configId = req.query.configId ? Number(req.query.configId) : undefined
  const title = req.query.title ? String(req.query.title) : undefined
  const where: any = {}
  if (configId) where.configId = configId
  if (title) where.title = { contains: title }
  const [records, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: { config: { select: { id: true, name: true, user: { select: { id: true, username: true } } } } },
      orderBy: { insertedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ])
  return res.json(pageResponse(records, { page, pageSize, total }))
}))

// GET /api/admin/apikeys?page=&pageSize=&name=
router.get('/apikeys', asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePaging(req)
  const name = req.query.name ? String(req.query.name) : undefined
  const where = name ? { name: { contains: name } } : {}
  const [keys, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.apiKey.count({ where }),
  ])
  const records = keys.map((k) => ({
    id: k.id,
    name: k.name,
    masked: maskApiKey(decryptApiKey(k.keyCipher)),
    username: k.user.username,
    userId: k.user.id,
    createdAt: k.createdAt,
  }))
  return res.json(pageResponse(records, { page, pageSize, total }))
}))

// GET /api/admin/stats
router.get('/stats', asyncHandler(async (_req, res) => {
  const [users, configs, conversations, messages, apiKeys, marketEntries] = await Promise.all([
    prisma.user.count(),
    prisma.deepseekConfig.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.apiKey.count(),
    prisma.appMarketEntry.count(),
  ])
  return res.json({ users, configs, conversations, messages, apiKeys, marketEntries })
}))

// GET /api/admin/market?page=&pageSize=&name=
router.get('/market', asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePaging(req)
  const name = req.query.name ? String(req.query.name) : undefined
  const where = name ? { name: { contains: name } } : {}
  const [records, total] = await Promise.all([
    prisma.appMarketEntry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.appMarketEntry.count({ where }),
  ])
  return res.json(pageResponse(records, { page, pageSize, total }))
}))

export default router
