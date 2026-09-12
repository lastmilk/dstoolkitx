import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { comparePassword } from '../utils/crypto.js';
import { loadShareConversation } from './share.routes.js';
const router = Router();
// GET /api/public/shares/:slug  公开访问分享（无 auth）
// 通过 header X-Share-Password 或 query ?password= 校验密码
router.get('/shares/:slug', asyncHandler(async (req, res) => {
    const slug = req.params.slug;
    const share = await prisma.share.findUnique({
        where: { slug },
        select: {
            id: true, userId: true, configId: true, deepseekConvId: true,
            title: true, theme: true, passwordHash: true,
            viewCount: true, expiresAt: true, createdAt: true,
        },
    });
    if (!share)
        return res.status(404).json({ error: '分享不存在或已删除' });
    if (share.expiresAt && share.expiresAt < new Date()) {
        return res.status(410).json({ error: '分享已过期' });
    }
    // 密码校验：如设置了密码，必须提供且匹配
    const provided = req.headers['x-share-password'] || req.query.password || '';
    if (share.passwordHash) {
        if (!provided) {
            return res.status(401).json({ error: '此分享需要密码', requiresPassword: true });
        }
        const ok = await comparePassword(provided, share.passwordHash);
        if (!ok)
            return res.status(403).json({ error: '密码错误' });
    }
    // 加载会话数据（不含 rawMapping，仅 messages + 聚合 turns）
    const conversation = await loadShareConversation(share);
    if (!conversation) {
        return res.status(404).json({ error: '分享对应的会话已被删除' });
    }
    // 非阻塞更新浏览量
    prisma.share.update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } }).catch(() => { });
    return res.json({
        share: {
            slug,
            title: share.title,
            theme: share.theme,
            createdAt: share.createdAt,
            viewCount: share.viewCount,
        },
        conversation,
    });
}));
export default router;
//# sourceMappingURL=public.routes.js.map