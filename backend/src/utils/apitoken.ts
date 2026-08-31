import crypto from 'node:crypto'

export const TOKEN_PREFIX = 'dstk_'

/** 生成随机访问令牌：dstk_ + 32 字节十六进制（不可猜测） */
export function generateApiToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(24).toString('hex')
}

/** SHA-256 哈希（仅存哈希，数据库不存明文） */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** 掩码展示：dstk_abcd****wxyz */
export function maskToken(token: string): string {
  if (!token) return ''
  if (token.length <= 12) return '****'
  return `${token.slice(0, 10)}****${token.slice(-4)}`
}

/** 校验令牌格式（前缀 + 长度），避免无效查询数据库 */
export function isApiTokenFormat(s: string): boolean {
  return typeof s === 'string' && s.startsWith(TOKEN_PREFIX) && s.length > TOKEN_PREFIX.length
}
