import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import type { McpTransport } from '@prisma/client'

const router = Router()
router.use(verifyJwt)

// GET /api/mcp  列出我的 MCP 服务器
router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const servers = await prisma.mcpServer.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      transport: true,
      url: true,
      command: true,
      args: true,
      headers: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  res.json({ servers })
}))

// POST /api/mcp  创建 MCP 服务器
const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  transport: z.enum(['HTTP', 'STDIO']).default('HTTP'),
  url: z.string().url().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
})

router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: '参数错误', details: parsed.error.flatten() })

  const { name, description, transport, url, command, args, env, headers, enabled } = parsed.data

  if (transport === 'HTTP' && !url) {
    return res.status(400).json({ error: 'HTTP 模式必须提供 url' })
  }
  if (transport === 'STDIO' && !command) {
    return res.status(400).json({ error: 'STDIO 模式必须提供 command' })
  }

  try {
    const server = await prisma.mcpServer.create({
      data: {
        userId: req.user!.id,
        name,
        description: description || null,
        transport: transport as McpTransport,
        url: transport === 'HTTP' ? url : null,
        command: transport === 'STDIO' ? command : null,
        args: args || undefined,
        env: env || undefined,
        headers: headers || undefined,
        enabled: enabled ?? true,
      },
    })
    res.json({ server })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: '同名 MCP 服务器已存在' })
    }
    throw e
  }
}))

// PUT /api/mcp/:id  更新 MCP 服务器
router.put('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const server = await prisma.mcpServer.findFirst({ where: { id, userId: req.user!.id } })
  if (!server) return res.status(404).json({ error: 'MCP 服务器不存在' })

  const { name, description, transport, url, command, args, env, headers, enabled } = req.body as any
  const data: any = {}
  if (typeof name === 'string') data.name = name
  if (typeof description === 'string') data.description = description
  if (typeof transport === 'string') data.transport = transport
  if (typeof url === 'string') data.url = url
  if (typeof command === 'string') data.command = command
  if (Array.isArray(args)) data.args = args
  if (env && typeof env === 'object') data.env = env
  if (headers && typeof headers === 'object') data.headers = headers
  if (typeof enabled === 'boolean') data.enabled = enabled

  try {
    const updated = await prisma.mcpServer.update({ where: { id }, data })
    res.json({ server: updated })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: '同名 MCP 服务器已存在' })
    }
    throw e
  }
}))

// DELETE /api/mcp/:id  删除 MCP 服务器
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const server = await prisma.mcpServer.findFirst({ where: { id, userId: req.user!.id } })
  if (!server) return res.status(404).json({ error: 'MCP 服务器不存在' })
  await prisma.mcpServer.delete({ where: { id } })
  res.json({ ok: true })
}))

export default router
