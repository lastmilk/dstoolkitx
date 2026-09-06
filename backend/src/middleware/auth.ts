import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/token.js'
import { prisma } from '../utils/prisma.js'
import { hashToken, isApiTokenFormat } from '../utils/apitoken.js'

export interface AuthedRequest extends Request {
  user?: {
    id: number
    username: string
    role: string
  }
}

export function verifyJwt(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录' })
  }
  try {
    const payload = verifyToken(token)
    req.user = { id: payload.sub, username: payload.username, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: '需要管理员权限' })
  }
  next()
}

/**
 * 双协议鉴权：dstk_ 访问令牌（App/第三方）或 JWT（Web 会话）均可。
 * /auth/phone/* 绑定手机号接口同时服务 Web（JWT）与 App（dstk_ 令牌）。
 */
export function verifyAnyToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token.startsWith('dstk_')) return verifyApiToken(req, res, next)
  return verifyJwt(req, res, next)
}

/**
 * RESTful API v1 鉴权中间件：校验 `Authorization: Bearer dstk_...` 访问令牌。
 * 仅存哈希，校验时对入站令牌做 SHA-256 后比对；同时非阻塞更新 lastUsedAt。
 */
export async function verifyApiToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    return res.status(401).json({ error: '缺少访问令牌，请在个人中心创建 API 令牌后通过 Authorization: Bearer <token> 传入' })
  }
  if (!isApiTokenFormat(token)) {
    return res.status(401).json({ error: '令牌格式错误，应以 dstk_ 开头' })
  }
  const tokenHash = hashToken(token)
  const found = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, username: true, role: true } } },
  })
  if (!found) {
    return res.status(401).json({ error: '令牌无效或已删除' })
  }
  if (found.expiresAt && found.expiresAt < new Date()) {
    return res.status(401).json({ error: '令牌已过期' })
  }
  req.user = {
    id: found.user.id,
    username: found.user.username,
    role: found.user.role,
  }
  // 非阻塞更新最后使用时间
  prisma.apiToken
    .update({ where: { id: found.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})
  next()
}
