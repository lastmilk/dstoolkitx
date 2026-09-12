import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { resolveEffectiveTier } from '../services/subscription.js';
import { aggregateTurnsFromMessages } from '../services/turns.js';
import { TIER_LIMITS } from '../utils/quota.js';
import { env } from '../config/env.js';
const router = Router();
router.use(verifyJwt);
const SHARE_THEMES = ['default', 'ocean', 'forest', 'sunset', 'mono'];
function generateSlug() {
    // 8 位 URL-safe 短码
    return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}
const createSchema = z.object({
    configId: z.number().int().positive(),
    deepseekConvId: z.string().min(1),
    theme: z.string().default('default'),
    password: z.string().min(1).max(64).optional(),
    customSlug: z.string().min(3).max(32).optional(),
    expiresInDays: z.number().int().positive().max(3650).optional(),
});
// POST /api/shares  创建分享（等级门控：FREE 禁止；PRO 自动 slug；PLUS/ULTIMATE 可自定义）
router.post('/', asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const { configId, deepseekConvId, theme, password, customSlug, expiresInDays } = parsed.data;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    const tier = resolveEffectiveTier(user);
    const limits = TIER_LIMITS[tier];
    if (!limits.canShare) {
        return res.status(403).json({ error: '当前等级不支持分享功能，请升级至 Pro 或更高等级', upgradeRequired: true });
    }
    if (!SHARE_THEMES.includes(theme)) {
        return res.status(400).json({ error: `主题无效，可选：${SHARE_THEMES.join(', ')}` });
    }
    // 校验会话归属
    const config = await prisma.deepseekConfig.findFirst({ where: { id: configId, userId: user.id } });
    if (!config)
        return res.status(404).json({ error: '配置不存在' });
    const conv = await prisma.conversation.findFirst({
        where: { configId, deepseekConvId },
        select: { id: true, title: true },
    });
    if (!conv)
        return res.status(404).json({ error: '会话不存在' });
    // 自定义短链：仅 PLUS/ULTIMATE
    let slug;
    if (customSlug) {
        if (!limits.canCustomSlug) {
            return res.status(403).json({ error: '自定义短链需 Plus 或更高等级', upgradeRequired: true });
        }
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(customSlug)) {
            return res.status(400).json({ error: '短链仅允许 3-32 位字母数字、下划线、连字符' });
        }
        const taken = await prisma.share.findUnique({ where: { slug: customSlug } });
        if (taken)
            return res.status(409).json({ error: '该短链已被占用' });
        slug = customSlug;
    }
    else {
        slug = generateSlug();
        // 极小概率冲突，重试一次
        let exists = await prisma.share.findUnique({ where: { slug } });
        while (exists) {
            slug = generateSlug();
            exists = await prisma.share.findUnique({ where: { slug } });
        }
    }
    const passwordHash = password ? await hashSharePassword(password) : null;
    const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 3600 * 1000)
        : null;
    const share = await prisma.share.create({
        data: {
            slug,
            userId: user.id,
            configId,
            deepseekConvId,
            title: conv.title,
            theme,
            passwordHash,
            expiresAt,
        },
    });
    return res.json({
        id: share.id,
        slug: share.slug,
        url: `${env.shareBaseUrl.replace(/\/$/, '')}/s/${share.slug}`,
        theme: share.theme,
        hasPassword: !!share.passwordHash,
        expiresAt: share.expiresAt,
    });
}));
// GET /api/shares  列出我的分享
router.get('/', asyncHandler(async (req, res) => {
    const rows = await prisma.share.findMany({
        where: { userId: req.user.id },
        select: {
            id: true, slug: true, title: true, theme: true,
            passwordHash: true, viewCount: true, expiresAt: true, createdAt: true,
            deepseekConvId: true, configId: true,
        },
        orderBy: { createdAt: 'desc' },
    });
    const shares = rows.map((s) => ({
        id: s.id, slug: s.slug, title: s.title, theme: s.theme,
        hasPassword: !!s.passwordHash, viewCount: s.viewCount,
        expiresAt: s.expiresAt, createdAt: s.createdAt,
        deepseekConvId: s.deepseekConvId, configId: s.configId,
    }));
    return res.json({ shares });
}));
// DELETE /api/shares/:id
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const share = await prisma.share.findFirst({ where: { id, userId: req.user.id } });
    if (!share)
        return res.status(404).json({ error: '分享不存在' });
    await prisma.share.delete({ where: { id } });
    return res.json({ ok: true });
}));
// bcrypt 对分享密码做哈希（与用户密码复用同一套）
async function hashSharePassword(plain) {
    const { hashPassword } = await import('../utils/crypto.js');
    return hashPassword(plain);
}
// 公开访问：/api/shares/public/:slug（无 auth，挂载在 public 路由下）
// 为避免循环依赖，公开路由单独放 public.routes.ts；但此处导出聚合消息的逻辑供复用
export async function loadShareConversation(share) {
    const conv = await prisma.conversation.findFirst({
        where: { configId: share.configId, deepseekConvId: share.deepseekConvId, config: { userId: share.userId } },
        include: { messages: { orderBy: { insertedAt: 'asc' } } },
    });
    if (!conv)
        return null;
    const turns = aggregateTurnsFromMessages(conv.messages);
    return {
        deepseekConvId: conv.deepseekConvId,
        title: conv.title,
        insertedAt: conv.insertedAt,
        updatedAt: conv.updatedAt,
        turnCount: conv.turnCount,
        messages: conv.messages.map((m) => ({
            nodeId: m.nodeId,
            parentId: m.parentId,
            role: m.role,
            model: m.model,
            content: m.content,
            insertedAt: m.insertedAt,
            turnIndex: m.turnIndex,
            versionIndex: m.versionIndex,
            subTurnIndex: m.subTurnIndex,
        })),
        turns,
    };
}
export { SHARE_THEMES };
export default router;
//# sourceMappingURL=share.routes.js.map