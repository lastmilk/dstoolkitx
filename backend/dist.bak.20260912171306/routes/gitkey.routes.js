import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { generateGitApiKey, hashGitApiKey, GIT_KEY_PREFIX, GIT_USERNAME_RE, needsGitUsername, } from '../utils/gitapikey.js';
const router = Router();
router.use(verifyJwt);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function keyPublic(t) {
    return {
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        masked: `${t.prefix}****`,
        scope: t.containerId == null ? 'global' : 'container',
        containerId: t.containerId,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        revokedAt: t.revokedAt,
        createdAt: t.createdAt,
    };
}
// GET /api/gitkeys  当前用户信息（含 gitUsername）+ key 列表
router.get('/', asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { id: true, username: true, gitUsername: true },
    });
    const keys = await prisma.gitApiKey.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
    });
    return res.json({
        username: user.username,
        gitUsername: user.gitUsername,
        needsGitUsername: needsGitUsername(user.username) && !user.gitUsername,
        keys: keys.map(keyPublic),
    });
}));
const createSchema = z.object({
    name: z.string().min(1).max(64),
    containerId: z.number().int().positive().nullable().optional(),
    expiresInDays: z.number().int().positive().max(3650).optional(),
    confirmGlobal: z.boolean().optional(),
});
// POST /api/gitkeys  创建 Git API Key，明文仅此一次返回
router.post('/', asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: '参数错误：name 必填，containerId/expiresInDays 可选' });
    }
    const { name, containerId, expiresInDays, confirmGlobal } = parsed.data;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    // 中文用户名首次生成 key 前必须设置英文 GitUsername
    if (needsGitUsername(user.username) && !user.gitUsername) {
        return res.status(400).json({
            code: 'GIT_USERNAME_REQUIRED',
            error: '你的用户名包含中文，请先设置英文/数字/下划线组成的 Git 推送用户名（3-32 位）',
        });
    }
    // 校验容器归属
    if (containerId != null) {
        const container = await prisma.deepseekConfig.findFirst({
            where: { id: containerId, userId: user.id },
        });
        if (!container)
            return res.status(404).json({ error: '对话容器不存在' });
    }
    else if (!confirmGlobal) {
        // 全局 key 安全性略低，需显式确认
        return res.status(400).json({
            code: 'GLOBAL_KEY_CONFIRM_REQUIRED',
            error: '全局 APIKey 可访问你名下所有容器仓库，安全性较低。请传 confirmGlobal: true 显式确认（不推荐）',
        });
    }
    const plain = generateGitApiKey();
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * MS_PER_DAY) : null;
    const created = await prisma.gitApiKey.create({
        data: {
            userId: user.id,
            containerId: containerId ?? null,
            name,
            keyHash: hashGitApiKey(plain),
            prefix: plain.slice(0, 11), // dstkg_xxxx
            expiresAt,
        },
    });
    return res.status(201).json({
        ...keyPublic(created),
        key: plain, // 明文仅此一次返回
    });
}));
const usernameSchema = z.object({ gitUsername: z.string().regex(GIT_USERNAME_RE, '只能包含英文、数字、下划线，长度 3-32') });
// POST /api/gitkeys/username  设置 Git 推送用户名
router.post('/username', asyncHandler(async (req, res) => {
    const parsed = usernameSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Git 用户名只能包含英文、数字、下划线，长度 3-32' });
    }
    const gitUsername = parsed.data.gitUsername;
    const clash = await prisma.user.findFirst({
        where: { gitUsername, id: { not: req.user.id } },
        select: { id: true },
    });
    if (clash)
        return res.status(409).json({ error: '该 Git 用户名已被占用' });
    await prisma.user.update({ where: { id: req.user.id }, data: { gitUsername } });
    return res.json({ ok: true, gitUsername });
}));
// DELETE /api/gitkeys/:id  撤销 key（软删除，立即失效）
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const k = await prisma.gitApiKey.findFirst({ where: { id, userId: req.user.id } });
    if (!k)
        return res.status(404).json({ error: 'Key 不存在' });
    await prisma.gitApiKey.update({ where: { id: k.id }, data: { revokedAt: new Date() } });
    return res.json({ ok: true });
}));
export { GIT_KEY_PREFIX };
export default router;
//# sourceMappingURL=gitkey.routes.js.map