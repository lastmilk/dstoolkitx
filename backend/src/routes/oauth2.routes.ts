import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import { generateApiToken, hashToken } from '../utils/apitoken.js'

/**
 * OAuth2.0 授权码 + PKCE（公共客户端，无 client_secret）。
 * 授权成功后签发 dstk_ 格式访问令牌并写入现有 ApiToken 表，
 * 因此 /api/v1/* 与 verifyApiToken 无需任何改动即可使用。
 */

const router = Router()

const CODE_TTL_MS = 10 * 60 * 1000       // 授权码 10 分钟
const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000  // access 30 天
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000 // refresh 60 天

/** 生成随机 refresh_token：rt_ + 32 字节 hex */
function generateRefreshToken(): string {
  return 'rt_' + crypto.randomBytes(24).toString('hex')
}

/** PKCE S256：BASE64URL(SHA256(verifier)) */
function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function scopeList(scope: unknown): string[] {
  if (typeof scope === 'string') return scope.split(' ').filter(Boolean)
  if (Array.isArray(scope)) return scope.filter((s): s is string => typeof s === 'string')
  return []
}

// ─────────────────────────────────────────────
// POST /api/oauth/authorize  （JWT 登录用户发起授权确认）
// ─────────────────────────────────────────────
const authorizeSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().min(1),
  scope: z.string().optional(),
  state: z.string().optional(),
  codeChallenge: z.string().min(16),
  codeChallengeMethod: z.literal('S256').optional().default('S256'),
})

router.post('/authorize', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = authorizeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: '参数错误：缺少 clientId/redirectUri/codeChallenge' })
  }
  const { clientId, redirectUri, state, codeChallenge } = parsed.data
  const scopes = scopeList(parsed.data.scope)

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  if (!client || !client.enabled) {
    return res.status(400).json({ error: '无效的 client_id' })
  }
  const registered = (client.redirectUris as string[]) || []
  if (!registered.includes(redirectUri)) {
    return res.status(400).json({ error: 'redirect_uri 未在客户端注册列表中' })
  }
  const allowedScopes = (client.scopes as string[]) || []
  const invalidScopes = scopes.filter((s) => !allowedScopes.includes(s))
  if (invalidScopes.length) {
    return res.status(400).json({ error: `不支持的 scope: ${invalidScopes.join(' ')}` })
  }

  // 生成一次性授权码（明文仅返回给发起方，库中只存 SHA256）
  const code = crypto.randomBytes(24).toString('hex')
  await prisma.oAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: client.id,
      userId: req.user!.id,
      scopes: scopes.length ? scopes : allowedScopes,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  })

  const redirectUrl = new URL(redirectUri)
  redirectUrl.searchParams.set('code', code)
  if (state) redirectUrl.searchParams.set('state', state)
  return res.json({ redirectUrl: redirectUrl.toString(), clientName: client.name })
}))

// ─────────────────────────────────────────────
// POST /api/oauth/token  （无鉴权：code + PKCE verifier 或 refresh_token）
// ─────────────────────────────────────────────
const tokenSchema = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_verifier: z.string().optional(),
  client_id: z.string().min(1),
  refresh_token: z.string().optional(),
})

/** 签发新的 dstk_ access + rt_ refresh（写 ApiToken + OAuthToken） */
async function issueTokens(
  userId: number,
  clientId: number,
  clientName: string,
  scopes: string[],
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const access = generateApiToken()
  const refresh = generateRefreshToken()
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS)
  const [apiToken] = await prisma.$transaction([
    prisma.apiToken.create({
      data: {
        userId,
        name: `OAuth · ${clientName}`,
        tokenHash: hashToken(access),
        prefix: access.slice(0, 10),
        expiresAt: accessExpiresAt,
      },
    }),
  ])
  await prisma.oAuthToken.create({
    data: {
      accessHash: hashToken(access),
      refreshHash: hashToken(refresh),
      clientId,
      userId,
      apiTokenId: apiToken.id,
      scopes,
      accessExpiresAt,
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  })
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
  }
}

router.post('/token', asyncHandler(async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', error_description: '参数错误' })
  }
  const { grant_type, client_id } = parsed.data

  const client = await prisma.oAuthClient.findUnique({ where: { clientId: client_id } })
  if (!client || !client.enabled) {
    return res.status(400).json({ error: 'invalid_client', error_description: '无效的 client_id' })
  }

  if (grant_type === 'authorization_code') {
    const { code, redirect_uri, code_verifier } = parsed.data
    if (!code || !redirect_uri || !code_verifier) {
      return res.status(400).json({ error: 'invalid_request', error_description: '缺少 code/redirect_uri/code_verifier' })
    }
    const oauthCode = await prisma.oAuthCode.findUnique({
      where: { codeHash: hashToken(code) },
      include: { client: true },
    })
    if (!oauthCode || oauthCode.clientId !== client.id) {
      return res.status(400).json({ error: 'invalid_grant', error_description: '授权码无效' })
    }
    if (oauthCode.used) {
      return res.status(400).json({ error: 'invalid_grant', error_description: '授权码已被使用' })
    }
    if (oauthCode.expiresAt < new Date()) {
      return res.status(400).json({ error: 'invalid_grant', error_description: '授权码已过期' })
    }
    if (oauthCode.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri 不匹配' })
    }
    // PKCE 校验
    if (pkceChallenge(code_verifier) !== oauthCode.codeChallenge) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE 校验失败' })
    }
    // 用后即焚
    await prisma.oAuthCode.update({ where: { id: oauthCode.id }, data: { used: true } })

    const scopes = (oauthCode.scopes as string[]) || []
    const issued = await issueTokens(oauthCode.userId, client.id, client.name, scopes)
    return res.json({ ...issued, token_type: 'Bearer', scope: scopes.join(' ') })
  }

  // grant_type === 'refresh_token'
  const { refresh_token } = parsed.data
  if (!refresh_token) {
    return res.status(400).json({ error: 'invalid_request', error_description: '缺少 refresh_token' })
  }
  const old = await prisma.oAuthToken.findUnique({
    where: { refreshHash: hashToken(refresh_token) },
    include: { client: true },
  })
  if (!old || old.clientId !== client.id) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh_token 无效' })
  }
  if (old.refreshExpiresAt && old.refreshExpiresAt < new Date()) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh_token 已过期' })
  }
  const scopes = (old.scopes as string[]) || []
  const issued = await issueTokens(old.userId, client.id, client.name, scopes)
  // 轮换：删除旧 token 对（含 ApiToken 行）
  await prisma.apiToken.delete({ where: { id: old.apiTokenId } }).catch(() => {})
  await prisma.oAuthToken.delete({ where: { id: old.id } }).catch(() => {})
  return res.json({ ...issued, token_type: 'Bearer', scope: scopes.join(' ') })
}))

// ─────────────────────────────────────────────
// POST /api/oauth/revoke  （App 登出：吊销 access/refresh 对应的令牌）
// ─────────────────────────────────────────────
const revokeSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
})

router.post('/revoke', asyncHandler(async (req, res) => {
  const parsed = revokeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request' })
  }
  const tokenHash = hashToken(parsed.data.token)
  // 无论传入 access 还是 refresh，均找到对应 OAuthToken 行并整体吊销
  const found = await prisma.oAuthToken.findFirst({
    where: { OR: [{ accessHash: tokenHash }, { refreshHash: tokenHash }] },
  })
  if (found) {
    await prisma.apiToken.delete({ where: { id: found.apiTokenId } }).catch(() => {})
    await prisma.oAuthToken.delete({ where: { id: found.id } })
  }
  // RFC 7009：即使 token 无效也返回 200
  return res.json({ ok: true })
}))

// ─────────────────────────────────────────────
// 开放平台：OAuth 应用管理（当前用户创建/查看/删除自有客户端）
// ─────────────────────────────────────────────

// GET /api/oauth/clients  列出当前用户创建的 OAuth 应用
router.get('/clients', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const clients = await prisma.oAuthClient.findMany({
    where: { ownerId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  })
  return res.json({
    clients: clients.map((c) => ({
      id: c.id,
      clientId: c.clientId,
      name: c.name,
      redirectUris: c.redirectUris as string[],
      scopes: c.scopes as string[],
      isPublic: c.isPublic,
      enabled: c.enabled,
      createdAt: c.createdAt,
    })),
  })
}))

const createClientSchema = z.object({
  name: z.string().min(1).max(64),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  scopes: z.array(z.string()).max(20).optional(),
  isPublic: z.boolean().optional().default(true),
})

// POST /api/oauth/clients  创建 OAuth 应用
router.post('/clients', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createClientSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: '参数错误：name 必填，redirectUris 为 URL 数组' })
  }
  const { name, redirectUris, scopes, isPublic } = parsed.data
  const clientId = 'dstk-' + crypto.randomBytes(12).toString('hex')
  const created = await prisma.oAuthClient.create({
    data: {
      clientId,
      name,
      redirectUris,
      scopes: scopes?.length ? scopes : ['read:conversations', 'profile'],
      isPublic,
      ownerId: req.user!.id,
    },
  })
  return res.status(201).json({
    id: created.id,
    clientId: created.clientId,
    name: created.name,
    redirectUris: created.redirectUris as string[],
    scopes: created.scopes as string[],
    isPublic: created.isPublic,
    enabled: created.enabled,
    createdAt: created.createdAt,
  })
}))

// DELETE /api/oauth/clients/:id  删除当前用户的 OAuth 应用
router.delete('/clients/:id', verifyJwt, asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const client = await prisma.oAuthClient.findFirst({ where: { id, ownerId: req.user!.id } })
  if (!client) return res.status(404).json({ error: '应用不存在' })
  // 级联删除关联的 code/token
  await prisma.oAuthToken.deleteMany({ where: { clientId: id } })
  await prisma.oAuthCode.deleteMany({ where: { clientId: id } })
  await prisma.oAuthClient.delete({ where: { id } })
  return res.json({ ok: true })
}))

export default router
