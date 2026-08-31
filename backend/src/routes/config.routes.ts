import { Router } from 'express'
import multer from 'multer'
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
import { indexDocuments, deleteDocuments, type MeiliDoc } from '../services/meilisearch.js'
import { parsePaging } from '../utils/paging.js'
import { aggregateTurnsFromMessages } from '../services/turns.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
})

router.use(verifyJwt)

// 由单个 ParsedConversation 构建该会话的 MeiliDoc[]：
//  - 每条 message 一个文档，id = `msg:${convId}:${nodeId}`
//  - 额外一条 title 文档，id = `title:${convId}`，role='TITLE'，便于按会话标题检索
function buildMeiliDocs(userId: number, configId: number, conv: ParsedConversation): MeiliDoc[] {
  const docs: MeiliDoc[] = []
  const convId = conv.deepseekConvId
  docs.push({
    id: `title:${convId}`,
    userId,
    configId,
    convId,
    nodeId: `title:${convId}`,
    title: conv.title,
    content: conv.title,
    role: 'TITLE',
    model: null,
    turnIndex: null,
    versionIndex: null,
    subTurnIndex: null,
    insertedAt: conv.insertedAt.toISOString(),
  })
  for (const msg of conv.messages) {
    docs.push({
      id: `msg:${convId}:${msg.nodeId}`,
      userId,
      configId,
      convId,
      nodeId: msg.nodeId,
      title: conv.title,
      content: msg.content,
      role: msg.role,
      model: msg.model,
      turnIndex: msg.turnIndex ?? null,
      versionIndex: msg.versionIndex ?? null,
      subTurnIndex: msg.subTurnIndex ?? null,
      insertedAt: msg.insertedAt.toISOString(),
    })
  }
  return docs
}

async function upsertConversations(userId: number, configId: number, convs: ParsedConversation[]) {
  const allNewDocs: MeiliDoc[] = []
  // 批量查询现有会话（消除 N+1 findUnique）
  const existingConvs = await prisma.conversation.findMany({
    where: { configId, deepseekConvId: { in: convs.map((c) => c.deepseekConvId) } },
    select: { id: true, deepseekConvId: true, updatedAt: true },
  })
  const existingMap = new Map(existingConvs.map((c) => [c.deepseekConvId, c]))

  for (const c of convs) {
    const existing = existingMap.get(c.deepseekConvId)
    const messageData = c.messages.map((m) => ({
      nodeId: m.nodeId,
      parentId: m.parentId,
      role: m.role,
      model: m.model,
      content: m.content,
      insertedAt: m.insertedAt,
      turnIndex: m.turnIndex ?? null,
      versionIndex: m.versionIndex ?? null,
      subTurnIndex: m.subTurnIndex ?? null,
    }))
    if (existing) {
      // 增量：仅当 updatedAt 更新时刷新 mapping + 重建 messages
      if (c.updatedAt > existing.updatedAt) {
        // 先抓旧 nodeId，用于清理 Meilisearch 中该会话的旧 msg 文档
        const oldMsgs = await prisma.message.findMany({
          where: { conversationId: existing.id },
          select: { nodeId: true },
        })
        const oldDocIds = oldMsgs.map((m) => `msg:${c.deepseekConvId}:${m.nodeId}`)
        await prisma.conversation.update({
          where: { id: existing.id },
          data: {
            title: c.title,
            insertedAt: c.insertedAt,
            updatedAt: c.updatedAt,
            turnCount: c.turns.length,
            rawMapping: c.mapping as any,
            messages: { deleteMany: {}, create: messageData },
          },
        })
        // 同步 Meilisearch：删旧 msg 文档（title 文档由 addDocuments 覆盖即可）
        try {
          await deleteDocuments(userId, oldDocIds)
        } catch (e) {
          console.warn('[meilisearch] deleteDocuments during upsert failed', e)
        }
        allNewDocs.push(...buildMeiliDocs(userId, configId, c))
      }
    } else {
      await prisma.conversation.create({
        data: {
          configId,
          deepseekConvId: c.deepseekConvId,
          title: c.title,
          insertedAt: c.insertedAt,
          updatedAt: c.updatedAt,
          turnCount: c.turns.length,
          rawMapping: c.mapping as any,
          messages: { create: messageData },
        },
      })
      allNewDocs.push(...buildMeiliDocs(userId, configId, c))
    }
  }
  if (allNewDocs.length > 0) {
    // 非阻塞：后台异步索引，不等待 Meilisearch 返回即可响应上传完成
    setImmediate(() => {
      indexDocuments(userId, allNewDocs).catch((e) =>
        console.warn('[meilisearch] background indexDocuments failed', e),
      )
    })
  }
}

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

// POST /api/configs  multipart: file(zip) + name
router.post('/', upload.single('file'), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传 zip 压缩包' })
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: '请填写配置名称' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })

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
  // 只解压一次 zip：先取 user.json 判定账号、建/改配置，再用 conversationsBuffer 分块写库
  const { userJson, conversationsBuffer } = extractZipEntries(req.file.buffer)
  const deepseekUser = buildDeepseekUser(userJson)
  const existing = await prisma.deepseekConfig.findUnique({
    where: {
      userId_deepseekUserId: { userId: user.id, deepseekUserId: deepseekUser.userId },
    },
  })

  let configId: number
  if (existing) {
    const updated = await prisma.deepseekConfig.update({
      where: { id: existing.id },
      data: { name, deepseekEmail: deepseekUser.email, deepseekMobile: deepseekUser.mobile },
    })
    configId = updated.id
  } else {
    const created = await prisma.deepseekConfig.create({
      data: {
        userId: user.id,
        name,
        deepseekUserId: deepseekUser.userId,
        deepseekEmail: deepseekUser.email,
        deepseekMobile: deepseekUser.mobile,
      },
    })
    configId = created.id
  }

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

// PUT /api/configs/:id/upload  multipart: file(zip) 增量更新（仅 cloud=true 的 DB 配置）
router.put('/:id/upload', upload.single('file'), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传 zip 压缩包' })
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({ where: { id, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
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

// DELETE /api/configs/:id
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const config = await prisma.deepseekConfig.findFirst({ where: { id, userId: req.user!.id } })
  if (!config) return res.status(404).json({ error: '配置不存在' })
  await prisma.deepseekConfig.delete({ where: { id } })
  return res.json({ ok: true })
}))

export default router
