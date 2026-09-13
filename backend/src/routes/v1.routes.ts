import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyApiToken, type AuthedRequest } from '../middleware/auth.js'
import { parsePaging, pageResponse } from '../utils/paging.js'
import { aggregateTurnsFromMessages } from '../services/turns.js'
import { extractZipEntries, buildDeepseekUser, streamConversationsBuffer } from '../services/deepseekParser.js'
import { streamUploadToCloud } from '../services/conversationStore.js'
import { needsPhoneForCloud, phoneRequiredResponse } from '../utils/cloudgate.js'

const router = Router()
router.use(verifyApiToken)

// 移动端本地上传（内存存储，与 config.routes 上限一致：200MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

function publicConfig(c: any) {
  return {
    id: c.id,
    name: c.name,
    deepseekUserId: c.deepseekUserId,
    deepseekEmail: c.deepseekEmail,
    deepseekMobile: c.deepseekMobile,
    conversationCount: c._count?.conversations ?? 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

// GET /api/v1/me  当前令牌所属用户
router.get('/me', asyncHandler(async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, username: true, role: true, cloudSyncEnabled: true, createdAt: true, tier: true, tierExpiresAt: true, isPermanentTier: true, phone: true, phoneVerifiedAt: true, registrationType: true },
  })
  return res.json({ user })
}))

// GET /api/v1/configs  列出当前用户的配置
router.get('/configs', asyncHandler(async (req: AuthedRequest, res) => {
  const configs = await prisma.deepseekConfig.findMany({
    where: { userId: req.user!.id },
    include: { _count: { select: { conversations: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  return res.json({ configs: configs.map(publicConfig) })
}))

// POST /api/v1/configs/upload  multipart: file(zip) + name
// 移动端本地上传 DeepSeek 导出数据包（App 持 dstk_ 令牌，无 JWT，故不与 /api/configs 复用路由）
// 逻辑与 POST /api/configs 云端分支一致：手机号闸门 → 解析 zip → 建容器 → 分块入库
router.post('/configs/upload', upload.single('file'), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传 DeepSeek 导出的 zip 压缩包' })
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: '请填写容器名称' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  // 云端闸门：新传统注册用户未绑手机号时禁止云端落库
  if (needsPhoneForCloud(user)) return phoneRequiredResponse(res)

  const { userJson, conversationsBuffer } = extractZipEntries(req.file.buffer)
  const deepseekUser = buildDeepseekUser(userJson)

  if (!user.cloudSyncEnabled) {
    // 未开启云端同步：只解析计数，不入库（App 无 IndexedDB 本地模式，如实告知）
    let count = 0
    await streamConversationsBuffer(conversationsBuffer, async () => { count++ })
    return res.json({ persisted: false, conversationCount: count, deepseekUser })
  }

  // 同账号可建多容器：导入一律新建
  const created = await prisma.deepseekConfig.create({
    data: {
      userId: user.id,
      name,
      deepseekUserId: deepseekUser.userId,
      deepseekEmail: deepseekUser.email,
      deepseekMobile: deepseekUser.mobile,
    },
  })
  const conversationCount = await streamUploadToCloud(req.user!.id, created.id, conversationsBuffer)

  const fresh = await prisma.deepseekConfig.findUniqueOrThrow({
    where: { id: created.id },
    include: { _count: { select: { conversations: true } } },
  })
  return res.json({
    persisted: true,
    config: publicConfig(fresh),
    deepseekUser,
    conversationCount,
  })
}))

// GET /api/v1/configs/:id/conversations  分页返回会话元数据（lite，无 messages）
router.get('/configs/:id/conversations', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({ where: { id, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  const { page, pageSize, paged } = parsePaging(req)
  const where = { configId: id }
  const [convs, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: {
        id: true,
        deepseekConvId: true,
        title: true,
        insertedAt: true,
        updatedAt: true,
        turnCount: true,
      },
      orderBy: { insertedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ])
  if (paged) {
    return res.json(pageResponse(convs, { page, pageSize, total }))
  }
  return res.json(pageResponse(convs, { page, pageSize, total }))
}))

// GET /api/v1/configs/:id/conversations/:convId  单个会话完整 messages + 聚合 turns
router.get('/configs/:id/conversations/:convId', asyncHandler(async (req: AuthedRequest, res) => {
  const configId = Number(req.params.id)
  const deepseekConvId = req.params.convId
  const config = await prisma.deepseekConfig.findFirst({ where: { id: configId, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  const conv = await prisma.conversation.findFirst({
    where: { configId, deepseekConvId },
    include: { messages: { orderBy: { insertedAt: 'asc' } } },
  })
  if (!conv) return res.status(404).json({ error: '会话不存在' })
  const turns = aggregateTurnsFromMessages(conv.messages)
  return res.json({ ...conv, turns })
}))

// GET /api/v1/search?q=&configId=&limit=  搜索消息内容（SQL LIKE，无 Meilisearch 依赖）
router.get('/search', asyncHandler(async (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500)
  if (!q) return res.json({ results: [] })
  const configId = req.query.configId ? Number(req.query.configId) : undefined
  const convWhere: any = { config: { userId: req.user!.id } }
  if (configId) convWhere.configId = configId

  const messages = await prisma.message.findMany({
    where: { content: { contains: q }, conversation: convWhere },
    include: { conversation: { select: { deepseekConvId: true, title: true, configId: true } } },
    orderBy: { insertedAt: 'desc' },
    take: limit,
  })

  const titleConvs = await prisma.conversation.findMany({
    where: { title: { contains: q }, ...convWhere },
    select: {
      deepseekConvId: true,
      title: true,
      configId: true,
      messages: { select: { nodeId: true, turnIndex: true, versionIndex: true, subTurnIndex: true }, take: 1 },
    },
    take: limit,
  })

  const results = [
    ...messages.map((m) => ({
      configId: m.conversation.configId,
      convId: m.conversation.deepseekConvId,
      nodeId: m.nodeId,
      title: m.conversation.title,
      content: m.content,
      role: m.role,
      turnIndex: m.turnIndex,
      versionIndex: m.versionIndex,
      subTurnIndex: m.subTurnIndex,
    })),
    ...titleConvs.map((c) => ({
      configId: c.configId,
      convId: c.deepseekConvId,
      nodeId: `title:${c.deepseekConvId}`,
      title: c.title,
      content: c.title,
      role: 'TITLE',
      turnIndex: c.messages[0]?.turnIndex ?? null,
      versionIndex: c.messages[0]?.versionIndex ?? null,
      subTurnIndex: c.messages[0]?.subTurnIndex ?? null,
    })),
  ]
  return res.json({ results: results.slice(0, limit) })
}))

// GET /api/v1/stats  当前用户的数据统计
router.get('/stats', asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.user!.id
  const [configs, conversations, messages, tokens] = await Promise.all([
    prisma.deepseekConfig.count({ where: { userId } }),
    prisma.conversation.count({ where: { config: { userId } } }),
    prisma.message.count({ where: { conversation: { config: { userId } } } }),
    prisma.apiToken.count({ where: { userId } }),
  ])
  return res.json({ configs, conversations, messages, apiTokens: tokens })
}))

export default router
