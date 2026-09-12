import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { activateTierWithCard, getTierStatus } from '../services/subscription.js';
import { validateKufakaCard, parseKufakaTier } from '../services/kufaka.js';
import { CREDIT_PACKS, grantCredits } from '../utils/quota.js';
const router = Router();
router.use(verifyJwt);
// GET /api/subscription/status  当前会员状态 + 用量 + 配额 + AI 积分
router.get('/status', asyncHandler(async (req, res) => {
    const status = await getTierStatus(req.user.id);
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { aiCredits: true },
    });
    res.json({
        tier: status.tier,
        effectiveTier: status.effectiveTier,
        isPermanent: status.isPermanent,
        activatedAt: status.activatedAt,
        expiresAt: status.expiresAt,
        expired: status.expired,
        aiCredits: user.aiCredits,
        usage: {
            usedMb: Number((status.usage.usedBytes / 1024 / 1024).toFixed(2)),
            usedTurns: status.usage.usedTurns,
        },
        limits: {
            maxMb: status.limits.maxMb < 0 ? null : Number((status.limits.maxMb / 1024 / 1024).toFixed(0)),
            maxTurns: status.limits.maxTurns < 0 ? null : status.limits.maxTurns,
            apiRatePerMin: status.limits.apiRatePerMin,
            canShare: status.limits.canShare,
            canCustomSlug: status.limits.canCustomSlug,
            maxFolders: status.limits.maxFolders < 0 ? null : status.limits.maxFolders,
            monthlyAiCredits: status.limits.monthlyAiCredits,
        },
    });
}));
// GET /api/subscription/plans  公开定价方案
router.get('/plans', asyncHandler(async (_req, res) => {
    res.json({ plans: TIER_PLANS_PUBLIC, creditPacks: CREDIT_PACKS });
}));
// GET /api/subscription/credits  AI 积分余额 + 充值包
router.get('/credits', asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { aiCredits: true },
    });
    res.json({
        balance: user.aiCredits,
        packs: CREDIT_PACKS,
        costs: {
            summary: 10,
            knowledgeCard: 15,
            aiOrganize: 30,
            exportPolish: 30,
        },
    });
}));
// POST /api/subscription/credits/purchase  购买积分充值包（卡密模式）
const creditPackSchema = z.object({ packId: z.string(), cardKey: z.string().optional() });
router.post('/credits/purchase', asyncHandler(async (req, res) => {
    const parsed = creditPackSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const pack = CREDIT_PACKS.find((p) => p.id === parsed.data.packId);
    if (!pack)
        return res.status(400).json({ error: '充值包不存在' });
    // 卡密验证：与现有卡密体系打通，或直接发放（演示）
    // 生产环境应接入真实支付，此处简化为直接发放（用户已付费的积分包）
    const balance = await grantCredits(req.user.id, 'TOPUP', pack.credits, `购买充值包：${pack.label}`);
    res.json({
        ok: true,
        message: `充值成功，已到账 ${pack.credits} 积分`,
        balance,
    });
}));
const redeemSchema = z.object({ code: z.string().min(8).max(64) });
// POST /api/subscription/redeem  兑换卡密（混合模式：本地优先 + kufaka 校验）
router.post('/redeem', asyncHandler(async (req, res) => {
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '卡密格式不正确' });
    const code = parsed.data.code.trim();
    // 1) 先查本地卡密池
    let card = await prisma.redeemCard.findUnique({ where: { code } });
    if (card) {
        if (card.status === 'USED')
            return res.status(409).json({ error: '该卡密已被使用' });
        if (card.status === 'REVOKED')
            return res.status(403).json({ error: '该卡密已作废' });
        if (card.expiresAt && card.expiresAt < new Date()) {
            return res.status(403).json({ error: '该卡密已过期' });
        }
    }
    else {
        // 2) 本地未找到，尝试 kufaka 校验
        const kf = await validateKufakaCard(code);
        if (kf && kf.valid) {
            const tier = parseKufakaTier(kf.tier);
            const duration = kf.duration ?? 'PERMANENT';
            if (!tier)
                return res.status(400).json({ error: '卡密等级信息异常' });
            // kufaka 校验通过：本地落库一张 USED 卡（source=KUFAKA）
            card = await prisma.redeemCard.create({
                data: {
                    code,
                    tier,
                    duration,
                    source: 'KUFAKA',
                    status: 'USED',
                    usedById: req.user.id,
                    redeemedAt: new Date(),
                },
            });
        }
        else if (kf && !kf.valid) {
            return res.status(403).json({ error: 'kufaka 校验未通过：卡密无效或已作废' });
        }
        else {
            return res.status(404).json({ error: '卡密无效' });
        }
    }
    const result = await activateTierWithCard(req.user.id, card);
    return res.json({
        ok: true,
        tier: result.tier,
        isPermanent: result.isPermanent,
        expiresAt: result.expiresAt,
        message: `兑换成功，当前等级：${tierLabel(result.tier)}${result.isPermanent ? '（永久）' : ''}`,
    });
}));
function tierLabel(t) {
    return { FREE: '免费版', PRO: '高级版 Pro', PLUS: '顶级版 Plus', ULTIMATE: '超强版 Ultimate', TEAM: '团队版' }[t];
}
export const TIER_PLANS_PUBLIC = [
    {
        tier: 'FREE',
        name: '免费版',
        price: 0,
        priceNote: '免费',
        duration: 'PERMANENT',
        features: [
            '对话云存储 50MB + 200 轮',
            'AI 摘要 5 次/天（免费体验）',
            '10 个文件夹 + 基础搜索',
            '⌘K 命令面板 + 自适应界面',
        ],
        buyUrl: '',
    },
    {
        tier: 'PRO',
        name: '高级版 Pro',
        price: 9.9,
        priceNote: '永久买断',
        duration: 'PERMANENT',
        features: [
            'Free 的所有功能',
            '对话云存储 100MB + 2000 轮',
            'AI 摘要 + 50 AI 积分/月',
            '自定义分享（网页完整版 + 5 种主题 + 密码）',
            '50 文件夹 + 手动标签',
            'AI 搜索过滤器',
        ],
        buyUrl: 'https://www.kufaka.com/shop/DLJTWXUW',
    },
    {
        tier: 'PLUS',
        name: '顶级版 Plus',
        price: 39,
        priceNote: '年付',
        duration: 'ANNUAL',
        features: [
            'Free 的所有功能',
            '对话云存储 500MB + 无限轮',
            'AI 摘要 + 500 AI 积分/月',
            'AI 自动整理文件夹 + 无限文件夹',
            '语义搜索 + AI 洞察报告',
            'RESTful API（100/min）+ 自定义短链',
            '多格式导出（AI 润色 + Obsidian）',
        ],
        buyUrl: 'https://www.kufaka.com/shop/DLJTWXUW',
        permanentPrice: 129,
    },
    {
        tier: 'ULTIMATE',
        name: '超强版 Ultimate',
        price: 149,
        priceNote: '年付',
        duration: 'ANNUAL',
        features: [
            'Free 的所有功能',
            '对话云存储 2GB + 无限轮',
            'AI 摘要 + 2000 AI 积分/月',
            'AI 自动整理 + 规则引擎',
            '个性化搜索联想 + 知识图谱',
            'RESTful API（500/min）+ 全格式导出',
            '模板/知识市场上架 + 邀请返佣',
        ],
        buyUrl: 'https://www.kufaka.com/shop/DLJTWXUW',
        permanentPrice: 399,
    },
    {
        tier: 'TEAM',
        name: '团队版 Team',
        price: 299,
        priceNote: '年付 · 按席位',
        duration: 'ANNUAL',
        features: [
            'Ultimate 的所有功能',
            '10GB+ 共享存储 + 团队知识库',
            '团队文件夹 + 权限管理（ACL）',
            '1000 AI 积分/席/月',
            '团队全局搜索 + 团队 BI 面板',
            'SSO + 管理员审计（Enterprise）',
        ],
        buyUrl: 'https://www.kufaka.com/shop/DLJTWXUW',
        permanentPrice: 999,
    },
];
export default router;
//# sourceMappingURL=subscription.routes.js.map