import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { TIER_LIMITS } from '../utils/quota.js';
import { resolveEffectiveTier } from '../services/subscription.js';
const router = Router();
router.use(verifyJwt);
// GET /api/folders  列出当前用户所有文件夹 + 标签
router.get('/', asyncHandler(async (req, res) => {
    const [folders, tags] = await Promise.all([
        prisma.folder.findMany({
            where: { userId: req.user.id },
            include: {
                _count: { select: { items: true } },
            },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.convTag.findMany({
            where: { userId: req.user.id },
            include: {
                _count: { select: { items: true } },
            },
            orderBy: { name: 'asc' },
        }),
    ]);
    res.json({
        folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            color: f.color,
            icon: f.icon,
            parentId: f.parentId,
            conversationCount: f._count.items,
            createdAt: f.createdAt,
        })),
        tags: tags.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            conversationCount: t._count.items,
            createdAt: t.createdAt,
        })),
    });
}));
const folderSchema = z.object({
    name: z.string().min(1).max(64),
    color: z.string().optional(),
    icon: z.string().optional(),
    parentId: z.number().optional(),
});
// POST /api/folders  创建文件夹（检查 tier 上限）
router.post('/', asyncHandler(async (req, res) => {
    const parsed = folderSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '文件夹名称必填' });
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: { tier: true, tierExpiresAt: true, isPermanentTier: true },
    });
    const effectiveTier = resolveEffectiveTier(user);
    const limits = TIER_LIMITS[effectiveTier];
    if (limits.maxFolders >= 0) {
        const count = await prisma.folder.count({ where: { userId: req.user.id } });
        if (count >= limits.maxFolders) {
            return res.status(403).json({
                error: `已达文件夹上限（${limits.maxFolders}个），请升级套餐解锁更多`,
                upgradeHint: true,
            });
        }
    }
    const folder = await prisma.folder.create({
        data: {
            userId: req.user.id,
            name: parsed.data.name,
            color: parsed.data.color,
            icon: parsed.data.icon,
            parentId: parsed.data.parentId,
        },
    });
    res.json({ folder });
}));
// DELETE /api/folders/:id  删除文件夹（关联的 ConversationTag 也会级联删除）
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.folder.deleteMany({ where: { id, userId: req.user.id } });
    res.json({ ok: true });
}));
const assignSchema = z.object({
    conversationId: z.number(),
});
// POST /api/folders/:id/assign  把对话加入文件夹
router.post('/:id/assign', asyncHandler(async (req, res) => {
    const folderId = Number(req.params.id);
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'conversationId 必填' });
    const folder = await prisma.folder.findFirst({ where: { id: folderId, userId: req.user.id } });
    if (!folder)
        return res.status(404).json({ error: '文件夹不存在' });
    // 验证对话归属
    const conv = await prisma.conversation.findUnique({
        where: { id: parsed.data.conversationId },
        include: { config: { select: { userId: true } } },
    });
    if (!conv || conv.config.userId !== req.user.id) {
        return res.status(404).json({ error: '对话不存在' });
    }
    // 幂等：如已存在则不重复创建
    const existing = await prisma.conversationTag.findFirst({
        where: { conversationId: parsed.data.conversationId, folderId },
    });
    if (!existing) {
        await prisma.conversationTag.create({
            data: { conversationId: parsed.data.conversationId, folderId },
        });
    }
    res.json({ ok: true });
}));
// DELETE /api/folders/:id/assign/:convId  从文件夹移除对话
router.delete('/:id/assign/:convId', asyncHandler(async (req, res) => {
    const folderId = Number(req.params.id);
    const conversationId = Number(req.params.convId);
    await prisma.conversationTag.deleteMany({
        where: { folderId, conversationId },
    });
    res.json({ ok: true });
}));
const tagSchema = z.object({
    name: z.string().min(1).max(32),
    color: z.string().optional(),
});
// POST /api/folders/tags  创建标签
router.post('/tags', asyncHandler(async (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '标签名称必填' });
    const existing = await prisma.convTag.findUnique({
        where: { userId_name: { userId: req.user.id, name: parsed.data.name } },
    });
    if (existing)
        return res.json({ tag: existing });
    const tag = await prisma.convTag.create({
        data: {
            userId: req.user.id,
            name: parsed.data.name,
            color: parsed.data.color,
        },
    });
    res.json({ tag });
}));
// POST /api/folders/tags/:id/assign  给对话打标签
router.post('/tags/:id/assign', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'conversationId 必填' });
    const tag = await prisma.convTag.findFirst({ where: { id: tagId, userId: req.user.id } });
    if (!tag)
        return res.status(404).json({ error: '标签不存在' });
    const conv = await prisma.conversation.findUnique({
        where: { id: parsed.data.conversationId },
        include: { config: { select: { userId: true } } },
    });
    if (!conv || conv.config.userId !== req.user.id) {
        return res.status(404).json({ error: '对话不存在' });
    }
    const existing = await prisma.conversationTag.findFirst({
        where: { conversationId: parsed.data.conversationId, tagId },
    });
    if (!existing) {
        await prisma.conversationTag.create({
            data: { conversationId: parsed.data.conversationId, tagId },
        });
    }
    res.json({ ok: true });
}));
// DELETE /api/folders/tags/:id  删除标签
router.delete('/tags/:id', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    await prisma.convTag.deleteMany({ where: { id: tagId, userId: req.user.id } });
    res.json({ ok: true });
}));
// GET /api/folders/by-folder/:folderId  列出文件夹内的对话
router.get('/by-folder/:folderId', asyncHandler(async (req, res) => {
    const folderId = Number(req.params.folderId);
    const items = await prisma.conversationTag.findMany({
        where: { folderId, conversation: { config: { userId: req.user.id } } },
        include: {
            conversation: {
                select: {
                    id: true,
                    deepseekConvId: true,
                    title: true,
                    insertedAt: true,
                    updatedAt: true,
                    _count: { select: { messages: true } },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
    res.json({
        conversations: items.map((i) => i.conversation),
    });
}));
export default router;
//# sourceMappingURL=folder.routes.js.map