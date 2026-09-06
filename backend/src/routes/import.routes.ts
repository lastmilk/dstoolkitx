import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import {
  detectSharePlatform,
  extractConvIdFromShareUrl,
  fetchShareConversation,
  parseUnifiedMessageJson,
  sourceToEnum,
} from '../services/importService.js'
import {
  createUnifiedConversation,
  listUserConversations,
} from '../services/unifiedConversationService.js'
import type { ConversationSource } from '@prisma/client'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
router.use(verifyJwt)

// POST /api/import/share  通过分享链接增量导入
router.post('/share', asyncHandler(async (req: AuthedRequest, res) => {
  const { url } = req.body as { url?: string }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: '请提供分享链接' })
  }

  const platform = detectSharePlatform(url)
  if (platform === 'unknown') {
    return res.status(400).json({
      error: '暂不支持该平台的分享链接，目前支持 DeepSeek 和 ChatGPT/OpenAI',
    })
  }

  const sourceConvId = extractConvIdFromShareUrl(url)

  // 增量去重：同一来源会话已导入则跳过
  if (sourceConvId) {
    const existing = await prisma.unifiedConversation.findFirst({
      where: {
        userId: req.user!.id,
        sourceConvId,
        source: sourceToEnum(platform),
      },
      select: { id: true, title: true },
    })
    if (existing) {
      return res.json({
        imported: false,
        reason: '该分享链接对应的对话已导入',
        conversation: existing,
      })
    }
  }

  // 抓取分享内容
  const fetched = await fetchShareConversation(url)
  if (!fetched) {
    return res.status(422).json({
      error: '无法自动解析该分享链接，请改用 JSON 全量导入',
      hint: '在 DeepSeek/ChatGPT 中导出对话数据，使用下方 JSON 导入功能',
    })
  }

  const source = sourceToEnum(fetched.platform)
  const conv = await createUnifiedConversation({
    userId: req.user!.id,
    title: fetched.conv.title,
    source,
    sourceUrl: url,
    sourceConvId: fetched.conv.sourceConvId || sourceConvId || undefined,
    messages: fetched.conv.messages,
  })

  res.json({ imported: true, conversation: conv, platform: fetched.platform })
}))

// POST /api/import/json  通过 DeepSeek/OpenAI 统一 message JSON 全量导入
router.post('/json', upload.single('file'), asyncHandler(async (req: AuthedRequest, res) => {
  const format = (req.body.format || 'deepseek').toLowerCase()
  if (format !== 'deepseek' && format !== 'openai') {
    return res.status(400).json({ error: 'format 必须为 deepseek 或 openai' })
  }

  let data: unknown
  if (req.file) {
    try {
      data = JSON.parse(req.file.buffer.toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'JSON 文件解析失败' })
    }
  } else if (req.body.data) {
    try {
      data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data
    } catch {
      return res.status(400).json({ error: 'JSON 数据解析失败' })
    }
  } else {
    return res.status(400).json({ error: '请上传 JSON 文件或提供 data 字段' })
  }

  const source: ConversationSource = format === 'deepseek' ? 'DEEPSEEK_JSON' : 'OPENAI_JSON'
  const conversations = parseUnifiedMessageJson(data, source)

  if (conversations.length === 0) {
    return res.status(400).json({ error: '未从 JSON 中解析到有效对话' })
  }

  // 全量导入：批量创建
  const created: Array<{ id: number; title: string; messageCount: number }> = []
  for (const conv of conversations) {
    const c = await createUnifiedConversation({
      userId: req.user!.id,
      title: conv.title,
      source,
      sourceConvId: conv.sourceConvId,
      messages: conv.messages,
    })
    created.push({ id: c.id, title: c.title, messageCount: conv.messages.length })
  }

  res.json({
    imported: true,
    count: created.length,
    conversations: created,
  })
}))

// GET /api/import/conversations  列出已导入的对话（所有来源）
router.get('/conversations', asyncHandler(async (req: AuthedRequest, res) => {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 20
  const result = await listUserConversations(req.user!.id, { page, pageSize })
  res.json(result)
}))

// GET /api/import/platforms  返回支持的平台列表
router.get('/platforms', (_req, res) => {
  res.json({
    platforms: [
      { id: 'deepseek', name: 'DeepSeek', shareUrlPattern: 'https://chat.deepseek.com/...' },
      { id: 'openai', name: 'ChatGPT / OpenAI', shareUrlPattern: 'https://chatgpt.com/share/...' },
    ],
    jsonFormats: [
      { id: 'deepseek', name: 'DeepSeek 消息 JSON', description: 'DeepSeek 导出的 messages 格式' },
      { id: 'openai', name: 'OpenAI 消息 JSON', description: 'OpenAI 兼容的 messages 格式' },
    ],
  })
})

export default router
