import type { Response, NextFunction } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { verifyCaptcha } from '../services/geetest.js'

const captchaSchema = z.object({
  captcha_id: z.string().min(1),
  lot_number: z.string().min(1),
  captcha_output: z.string().min(1),
  pass_token: z.string().min(1),
  gen_time: z.string().min(1),
})

/**
 * 极验 GT4 服务端二次校验中间件。
 * - 前端把 onSuccess 回调的四参数 + captcha_id 原样放进 body.captcha
 * - 两对 id/key 均未配置时放行（开发环境友好）
 * - captcha_id 与任一配置不匹配 → 400；二次校验失败 → 403
 */
export async function requireCaptcha(req: any, res: Response, next: NextFunction) {
  if (!env.geetest.anyEnabled) return next()

  const parsed = captchaSchema.safeParse(req.body?.captcha)
  if (!parsed.success) return res.status(400).json({ error: '请先完成人机验证' })

  const g = env.geetest
  const knownId = (g.webEnabled && parsed.data.captcha_id === g.webId) ||
    (g.appEnabled && parsed.data.captcha_id === g.appId)
  if (!knownId) return res.status(400).json({ error: '验证码配置错误' })

  const ok = await verifyCaptcha(parsed.data)
  if (!ok) return res.status(403).json({ error: '人机验证未通过，请重试' })
  return next()
}
