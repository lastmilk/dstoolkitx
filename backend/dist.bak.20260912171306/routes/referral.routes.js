import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { grantCredits } from '../utils/quota.js';
const router = Router();
router.use(verifyJwt);
function genCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
// 确保用户有 referralCode（懒初始化）
async function ensureReferralCode(userId) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { referralCode: true },
    });
    if (user.referralCode)
        return user.referralCode;
    const code = `DSTK${userId.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
    return code;
}
// GET /api/referral/info  邀请信息 + 链接 + 奖励
router.get('/info', asyncHandler(async (req, res) => {
    const code = await ensureReferralCode(req.user.id);
    const [links, rewards, referredCount] = await Promise.all([
        prisma.referralLink.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.referralReward.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
        }),
        prisma.user.count({ where: { referredById: req.user.id } }),
    ]);
    const totalEarned = rewards.reduce((sum, r) => sum + r.credits, 0);
    res.json({
        referralCode: code,
        referralLink: `${env_frontendOrigin()}/register?ref=${code}`,
        links: links.map((l) => ({
            id: l.id,
            code: l.code,
            clicks: l.clicks,
            signupCount: l.signupCount,
            totalCommissionEarned: l.totalCommissionEarned,
            createdAt: l.createdAt,
        })),
        rewards: rewards.map((r) => ({
            id: r.id,
            type: r.type,
            credits: r.credits,
            detail: r.detail,
            createdAt: r.createdAt,
        })),
        stats: {
            referredCount,
            totalEarned,
            rewardCount: rewards.length,
        },
    });
}));
// POST /api/referral/links  生成新邀请链接
router.post('/links', asyncHandler(async (req, res) => {
    const code = genCode();
    const link = await prisma.referralLink.create({
        data: { userId: req.user.id, code },
    });
    res.json({
        id: link.id,
        code: link.code,
        link: `${env_frontendOrigin()}/register?ref=${link.code}`,
    });
}));
// POST /api/referral/bind  绑定邀请码（注册后或首次登录时调用）
router.post('/bind', asyncHandler(async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!code)
        return res.status(400).json({ error: '邀请码必填' });
    const referrer = await prisma.user.findFirst({
        where: {
            OR: [
                { referralCode: code },
                { referralLinks: { some: { code } } },
            ],
        },
        select: { id: true },
    });
    if (!referrer)
        return res.status(404).json({ error: '邀请码无效' });
    if (referrer.id === req.user.id)
        return res.status(400).json({ error: '不能邀请自己' });
    // 检查是否已绑定
    const me = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { referredById: true },
    });
    if (me.referredById)
        return res.json({ ok: true, message: '已绑定过邀请人' });
    // 绑定关系 + 发放积分（grantCredits 内部会写 QuotaLedger 流水）
    await prisma.user.update({
        where: { id: req.user.id },
        data: { referredById: referrer.id },
    });
    await grantCredits(referrer.id, 'REFERRAL_SIGNUP', 500, `邀请用户 #${req.user.id} 注册`);
    await grantCredits(req.user.id, 'REFERRAL_WELCOME', 300, '受邀注册欢迎积分');
    await prisma.referralReward.create({
        data: {
            userId: referrer.id,
            type: 'SIGNUP',
            refereeId: req.user.id,
            credits: 500,
            detail: '邀请用户注册',
        },
    });
    await prisma.referralReward.create({
        data: {
            userId: req.user.id,
            type: 'WELCOME',
            refereeId: referrer.id,
            credits: 300,
            detail: '受邀注册欢迎积分',
        },
    });
    res.json({ ok: true, message: '邀请绑定成功，双方已获得积分奖励' });
}));
function env_frontendOrigin() {
    return process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
}
export default router;
//# sourceMappingURL=referral.routes.js.map