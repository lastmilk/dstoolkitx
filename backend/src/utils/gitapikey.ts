import crypto from 'node:crypto'

export const GIT_KEY_PREFIX = 'dstkg_'

/** Git 推送专用用户名规则：英文+数字+下划线，3-32 位 */
export const GIT_USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/

/** username 是否含非 ASCII（中文等），此类用户必须设置 gitUsername 才能 Git 推送 */
export function needsGitUsername(username: string): boolean {
  return /[^\x00-\x7F]/.test(username)
}

/** 生成 Git API Key：dstkg_ + 32 字节 base62（不可猜测） */
export function generateGitApiKey(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(32)
  let s = ''
  for (const b of bytes) s += alphabet[b % alphabet.length]
  return GIT_KEY_PREFIX + s
}

/** SHA-256 哈希（仅存哈希，数据库不存明文） */
export function hashGitApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/** 掩码展示：dstkg_abcd****wxyz */
export function maskGitApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 14) return '****'
  return `${key.slice(0, 10)}****${key.slice(-4)}`
}
