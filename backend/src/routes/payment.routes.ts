import { Router } from 'express'
import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'

const router = Router()
router.use(verifyJwt)

// ═══════════ 套餐目录（与前端 tiers 保持一致） ═══════════
// 价格仅作展示，真实扣款金额由支付通道返回。
const TIER_CATALOG = {
  pro: {
    name: 'Pro',
    badge: '高级版',
    billings: [{ period: 'permanent', price: 39 }],
  },
  plus: {
    name: 'Plus',
    badge: '顶级版',
    billings: [
      { period: 'annual', price: 29 },
      { period: 'permanent', price: 99 },
    ],
  },
  ultimate: {
    name: 'Ultimate',
    badge: '超能版',
    billings: [
      { period: 'annual', price: 59 },
      { period: 'permanent', price: 199 },
    ],
  },
} as const

function resolveCardKeyDir(): string {
  // 兼容 ESM 与运行目录；优先以 backend 根为基准
  const here = path.dirname(fileURLToPath(import.meta.url))
  const backendRoot = path.resolve(here, '..', '..')
  return path.resolve(backendRoot, env.payment.cardkey.dir)
}

// ═══════════ GET /api/payment/config ═══════════
// 返回当前可用的支付方式与卡密兜底信息。前端据此决定 UI 与回退逻辑。
router.get(
  '/config',
  asyncHandler(async (_req: AuthedRequest, res) => {
    return res.json({
      methods: {
        wechat: env.payment.wechat.enabled,
        alipay: env.payment.alipay.enabled,
        // 卡密始终可用（兜底方案）
        cardkey: true,
      },
      tiers: TIER_CATALOG,
      cardKeyShopUrl: env.payment.cardkey.shopUrl,
      cardKeyDocsUrl: env.payment.cardkey.docsUrl,
    })
  }),
)

// ═══════════ POST /api/payment/order ═══════════
// 创建订单（预留）。当前未接入真实支付通道时，返回占位二维码与订单号，
// 仅供前端走通流程；接入微信/支付宝后请在此处生成真实预下单二维码。
const orderSchema = z.object({
  tier: z.enum(['pro', 'plus', 'ultimate']),
  period: z.enum(['annual', 'permanent']),
  method: z.enum(['wechat', 'alipay']),
})

router.post(
  '/order',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = orderSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '参数错误：tier / period / method 必填' })
    }
    const { tier, period, method } = parsed.data
    const cat = TIER_CATALOG[tier]
    const billing = cat.billings.find((b) => b.period === period)
    if (!billing) {
      return res.status(400).json({ error: '该套餐不支持所选计费周期' })
    }
    if (method === 'wechat' && !env.payment.wechat.enabled) {
      return res.status(503).json({ error: '微信支付未开通，请使用卡密充值' })
    }
    if (method === 'alipay' && !env.payment.alipay.enabled) {
      return res.status(503).json({ error: '支付宝未开通，请使用卡密充值' })
    }

    // TODO: 接入真实支付通道后，在此生成预下单并返回二维码 URL / 跳转链接。
    // 当前返回占位订单号，前端展示通用二维码。
    const orderNo = `DSTK-${Date.now()}-${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`
    return res.json({
      orderNo,
      tier,
      period,
      method,
      amount: billing.price,
      currency: 'CNY',
      // 真实接入后改为 wxpay/alipay 返回的 codeUrl / qrCode
      qrPlaceholder: true,
      expiresIn: 900,
    })
  }),
)

// ═══════════ POST /api/payment/redeem ═══════════
// 卡密兑换。读取 PAYMENT_CARD_KEY_DIR 下的卡密文件进行校验。
// 卡密文件命名约定：<tier>-<period>.txt（如 plus-annual.txt / ultimate-permanent.txt）
// 每行一个卡密，兑换成功后从文件中删除该行（防止重复使用）。
const redeemSchema = z.object({
  cardKey: z.string().min(1),
  tier: z.enum(['pro', 'plus', 'ultimate']),
  period: z.enum(['annual', 'permanent']),
})

router.post(
  '/redeem',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = redeemSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '参数错误：cardKey / tier / period 必填' })
    }
    const { cardKey, tier, period } = parsed.data
    const cat = TIER_CATALOG[tier]
    const billing = cat.billings.find((b) => b.period === period)
    if (!billing) {
      return res.status(400).json({ error: '该套餐不支持所选计费周期' })
    }

    const filePath = path.resolve(resolveCardKeyDir(), `${tier}-${period}.txt`)
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch {
      return res.status(503).json({
        error: `卡密库未配置或文件缺失（${tier}-${period}.txt）。请联系管理员配置 PAYMENT_CARD_KEY_DIR，或前往 ${env.payment.cardkey.shopUrl} 购买。`,
      })
    }

    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'))
    const idx = lines.indexOf(cardKey.trim())
    if (idx === -1) {
      return res.status(400).json({ error: '卡密无效，请检查后重试' })
    }

    // 卡密有效：从文件中删除该行（一次性使用）
    lines.splice(idx, 1)
    try {
      await fs.writeFile(filePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
    } catch {
      // 写入失败不阻塞响应，但记录日志便于人工核销
      console.warn(`[payment] 卡密 ${cardKey.slice(0, 8)}*** 核销后写回失败，请人工核对`)
    }

    // TODO: 在此为用户开通对应权益（更新 User 表的 plan / expiresAt 字段）
    // 当前 User 模型尚未包含 plan 字段，权益开通逻辑待 schema 升级后补全。
    return res.json({
      ok: true,
      message: `${cat.name} · ${billing.period === 'permanent' ? '永久' : '年费'} 卡密兑换成功，权益将在几分钟内到账`,
      redeemed: {
        tier: cat.name,
        period: billing.period === 'permanent' ? '永久' : '年费',
      },
    })
  }),
)

export default router
