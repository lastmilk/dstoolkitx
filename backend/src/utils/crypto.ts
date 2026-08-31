import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

const keyBuffer = Buffer.from(env.aesKey, 'hex')
if (keyBuffer.length !== 32) {
  throw new Error('AES_KEY 必须是 32 字节的十六进制字符串（64 个字符）')
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// AES-256-GCM：输出 base64( iv[12] + tag[16] + cipher )
export function encryptApiKey(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptApiKey(cipherB64: string): string {
  const data = Buffer.from(cipherB64, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const enc = data.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}
