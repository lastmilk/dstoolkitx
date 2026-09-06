import { createHmac } from 'crypto'
import { env } from '../config/env.js'

export interface GeetestParams {
  captcha_id: string
  lot_number: string
  captcha_output: string
  pass_token: string
  gen_time: string
}

// 按 captcha_id 找到对应的客户端 key（仅接受 Web / App 两对配置）
function resolveKey(captchaId: string): string | null {
  const g = env.geetest
  if (g.webEnabled && captchaId === g.webId) return g.webKey
  if (g.appEnabled && captchaId === g.appId) return g.appKey
  return null
}

/**
 * 极验 GT4 服务端二次校验
 * 文档: https://docs.geetest.com/gt4/overview/flowchart
 * POST https://captcha4.geetest.com/validate?captcha_id=<id>
 * sign_token = HMAC-SHA256(key, lot_number) 的十六进制
 * 网络异常按官方 "abort" 策略处理：视为校验失败
 */
export async function verifyCaptcha(p: GeetestParams): Promise<boolean> {
  const key = resolveKey(p.captcha_id)
  if (!key) return false

  const signToken = createHmac('sha256', key).update(p.lot_number).digest('hex')
  const body = { ...p, sign_token: signToken }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`https://captcha4.geetest.com/validate?captcha_id=${encodeURIComponent(p.captcha_id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return false
    const data = (await res.json()) as { result?: string }
    return data.result === 'success'
  } catch {
    return false
  }
}
