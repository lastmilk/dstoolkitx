import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import {
  parseDeepseekZip,
  streamConversationsBuffer,
  extractZipEntries,
  buildDeepseekUser,
  type ParsedConversation,
} from '../services/deepseekParser.js'
import { upsertConversations } from '../services/conversationStore.js'
import { parsePaging } from '../utils/paging.js'
import { aggregateTurnsFromMessages } from '../services/turns.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
})

router.use(verifyJwt)

// Git 仓库根目录（与 git.routes.ts 保持一致）
const GIT_REPO_ROOT = process.env.GIT_REPO_ROOT || path.resolve(process.cwd(), 'data', 'git-repos')

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

// 流式上传：用 stream-json 增量解析 conversations.json，每解析完一个会话即
// 提取 turns+扁平化，并按 CHUNK_SIZE 分块写库（cloud=true），避免大 JSON 一次性
// JSON.parse 阻塞事件循环，同时降低单事务内存峰值。
const UPLOAD_CHUNK_SIZE = 50

/**
 * cloud=true 增量写库：流式解析 conversationsBuffer → 分块 upsert。
 * 返回 conversationCount（不回传全部会话，前端按需分页加载）。
 */
async function streamUploadToCloud(
  userId: number,
  configId: number,
  conversationsBuffer: Buffer,
): Promise<number> {
  let batch: ParsedConversation[] = []
  let count = 0
  const flush = async () => {
    if (batch.length === 0) return
    const chunk = batch
    batch = []
    await upsertConversations(userId, configId, chunk)
  }
  await streamConversationsBuffer(conversationsBuffer, async (conv) => {
    batch.push(conv)
    count++
    if (batch.length >= UPLOAD_CHUNK_SIZE) {
      await flush()
    }
  })
  await flush()
  return count
}

// POST /api/configs  multipart: file(zip) + name [+ mode=git]
// mode=git（对话容器 Git 流程）：只解析 zip 并建/取容器壳，不写对话入库 ——
// 对话由客户端以 Git 增量提交推送后经镜像入库。
router.post('/', upload.single('file'), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传 zip 压缩包' })
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: '请填写配置名称' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })

  // ── Git 模式：解析 + 容器壳，不入库 ──
  if (String(req.body.mode || '') === 'git') {
    const parsed = await parseDeepseekZip(req.file.buffer)
    const deepseekUser = parsed.deepseekUser
    // 同账号可建多容器：每次 Git 导入都新建（仓库 = u<uid>_c<cid>.git，cid 唯一）
    const config = await prisma.deepseekConfig.create({
      data: {
        userId: user.id,
        name,
        deepseekUserId: deepseekUser.userId,
        deepseekEmail: deepseekUser.email,
        deepseekMobile: deepseekUser.mobile,
      },
    })
    return res.json({
      persisted: false,
      git: true,
      config: publicConfig(config),
      deepseekUser,
      conversations: parsed.conversations,
      conversationCount: parsed.conversations.length,
    })
  }

  if (!user.cloudSyncEnabled) {
    // cloud=false：不落库，流式解析后收集全部会话返回前端存 IndexedDB
    // （解析阶段仍走 stream-json，不阻塞事件循环）
    const parsed = await parseDeepseekZip(req.file.buffer)
    return res.json({
      persisted: false,
      config: {
        id: null,
        name,
        deepseekUserId: parsed.deepseekUser.userId,
        deepseekEmail: parsed.deepseekUser.email,
        deepseekMobile: parsed.deepseekUser.mobile,
      },
      deepseekUser: parsed.deepseekUser,
      conversations: parsed.conversations,
      conversationCount: parsed.conversations.length,
    })
  }

  // cloud=true：流式解析 + 分块写库（不回传全部会话，前端按需分页加载）
  // 只解压一次 zip：先取 user.json 判定账号、新建容器，再用 conversationsBuffer 分块写库
  const { userJson, conversationsBuffer } = extractZipEntries(req.file.buffer)
  const deepseekUser = buildDeepseekUser(userJson)
  // 同账号可建多容器：导入一律新建（更新已有容器请走 PUT /:id/upload）
  const created = await prisma.deepseekConfig.create({
    data: {
      userId: user.id,
      name,
      deepseekUserId: deepseekUser.userId,
      deepseekEmail: deepseekUser.email,
      deepseekMobile: deepseekUser.mobile,
    },
  })
  const configId = created.id

  const conversationCount = await streamUploadToCloud(req.user!.id, configId, conversationsBuffer)

  const fresh = await prisma.deepseekConfig.findUniqueOrThrow({
    where: { id: configId },
    include: { _count: { select: { conversations: true } } },
  })
  return res.json({
    persisted: true,
    config: publicConfig(fresh),
    deepseekUser,
    conversationCount,
  })
}))

// PUT /api/configs/:id/upload  multipart: file(zip) [+ mode=git] 增量更新
// mode=git：只解析返回 conversations，不写库（客户端 Git 提交后镜像入库）
router.put('/:id/upload', upload.single('file'), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传 zip 压缩包' })
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({ where: { id, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  // 允许顺带改名（前端更新弹窗支持编辑名称）
  const newName = String(req.body.name || '').trim()
  if (newName && newName !== config.name) {
    await prisma.deepseekConfig.update({ where: { id: config.id }, data: { name: newName } })
    config.name = newName
  }
  if (String(req.body.mode || '') === 'git') {
    const parsed = await parseDeepseekZip(req.file.buffer)
    if (parsed.deepseekUser.userId !== config.deepseekUserId) {
      return res.status(400).json({ error: '上传的数据包不属于该容器的 Deepseek 账号' })
    }
    return res.json({
      persisted: false,
      git: true,
      config: publicConfig(config),
      deepseekUser: parsed.deepseekUser,
      conversations: parsed.conversations,
      conversationCount: parsed.conversations.length,
    })
  }
  // 只解压一次 zip：取 user.json 校验账号 + conversationsBuffer 分块写库
  const { userJson, conversationsBuffer } = extractZipEntries(req.file.buffer)
  const deepseekUser = buildDeepseekUser(userJson)
  if (deepseekUser.userId !== config.deepseekUserId) {
    return res.status(400).json({ error: '上传的数据包不属于该配置的 Deepseek 账号' })
  }
  const conversationCount = await streamUploadToCloud(req.user!.id, config.id, conversationsBuffer)
  const fresh = await prisma.deepseekConfig.findUniqueOrThrow({
    where: { id: config.id },
    include: { _count: { select: { conversations: true } } },
  })
  return res.json({
    persisted: true,
    config: publicConfig(fresh),
    deepseekUser,
    conversationCount,
  })
}))

// GET /api/configs
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const configs = await prisma.deepseekConfig.findMany({
    where: { userId: req.user!.id },
    include: { _count: { select: { conversations: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  return res.json({ configs: configs.map(publicConfig) })
}))

// GET /api/configs/:id
router.get('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({
    where: { id, userId: req.user!.id },
    include: {
      conversations: {
        select: {
          id: true,
          deepseekConvId: true,
          title: true,
          insertedAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
        orderBy: { insertedAt: 'desc' },
      },
    },
  })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  return res.json({ config: publicConfig(config), conversations: config.conversations })
}))

// GET /api/configs/:id/conversations-batch  批量返回会话 + messages + turns（不含 rawMapping）
// 支持 ?page=&pageSize= 分页（转换页按页加载带 messages 的会话）
router.get('/:id/conversations-batch', asyncHandler(async (req: AuthedRequest, res) => {
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
        messages: {
          select: {
            nodeId: true,
            parentId: true,
            role: true,
            model: true,
            content: true,
            insertedAt: true,
            turnIndex: true,
            versionIndex: true,
            subTurnIndex: true,
          },
          orderBy: { insertedAt: 'asc' },
        },
      },
      orderBy: { insertedAt: 'desc' },
      ...(paged ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paged ? prisma.conversation.count({ where }) : Promise.resolve(undefined),
  ])
  const result = convs.map((c) => ({
    ...c,
    turns: aggregateTurnsFromMessages(c.messages),
  }))
  if (paged) {
    return res.json({ conversations: result, total: total ?? 0, page, pageSize, hasMore: page * pageSize < (total ?? 0) })
  }
  return res.json({ conversations: result })
}))

// GET /api/configs/:id/conversations-lite  轻量版：仅返回会话元数据（无 messages），用于首屏秒级加载
// 支持 ?page=&pageSize= 分页（探索页按页加载会话列表）
router.get('/:id/conversations-lite', asyncHandler(async (req: AuthedRequest, res) => {
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
      ...(paged ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paged ? prisma.conversation.count({ where }) : Promise.resolve(undefined),
  ])
  if (paged) {
    return res.json({ conversations: convs, total: total ?? 0, page, pageSize, hasMore: page * pageSize < (total ?? 0) })
  }
  return res.json({ conversations: convs })
}))

// GET /api/configs/:id/conversations/:convId  单个会话完整 messages + 聚合 turns（convId 为 deepseekConvId 字符串）
router.get('/:id/conversations/:convId', asyncHandler(async (req: AuthedRequest, res) => {
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

// GET /api/configs/:id/git-info  Git 生态：仓库地址 + 推送用户名 + 是否已有可用 key
router.get('/:id/git-info', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({ where: { id, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, username: true, gitUsername: true },
  })
  const hasKey = await prisma.gitApiKey.findFirst({
    where: { userId: user.id, revokedAt: null, OR: [{ containerId: null }, { containerId: id }] },
    select: { id: true },
  })
  const gitUsername = user.gitUsername ?? (/[^\x00-\x7F]/.test(user.username) ? null : user.username)
  return res.json({
    repoUrl: `/git/u${user.id}_c${config.id}.git`,
    gitUsername,
    needsGitUsername: !gitUsername,
    hasKey: !!hasKey,
    defaultBranch: 'main',
  })
}))

// DELETE /api/configs/:id
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({ where: { id, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  await prisma.deepseekConfig.delete({ where: { id } })
  // 同步清理 Git 仓库（幂等：不存在即忽略）
  try {
    fs.rmSync(path.join(GIT_REPO_ROOT, `u${req.user!.id}_c${config.id}.git`), { recursive: true, force: true })
  } catch {}
  return res.json({ ok: true })
}))

export default router
