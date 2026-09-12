import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { search } from '../services/meilisearch.js';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { verifyJwt } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async.js';
const router = Router();
// 每用户每分钟 30 次搜索，超限返回 429
const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per user
    keyGenerator: (req) => String(req.user?.id || req.ip),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '搜索请求过于频繁，请稍后再试（每分钟限 30 次）' },
});
router.use(verifyJwt, searchLimiter);
// SQL LIKE fallback: when Meilisearch is disabled, search directly in the database.
// Returns results in the same format as Meilisearch's MeiliSearchResult.
async function sqlFallbackSearch(userId, q, limit, configId) {
    const convWhere = { config: { userId } };
    if (configId)
        convWhere.configId = configId;
    // Search messages (USER + ASSISTANT content)
    const messages = await prisma.message.findMany({
        where: {
            content: { contains: q },
            conversation: convWhere,
        },
        include: {
            conversation: {
                select: { deepseekConvId: true, title: true, configId: true },
            },
        },
        orderBy: { insertedAt: 'desc' },
        take: limit,
    });
    // Search conversation titles
    const titleConvs = await prisma.conversation.findMany({
        where: { title: { contains: q }, ...convWhere },
        select: {
            deepseekConvId: true,
            title: true,
            configId: true,
            messages: {
                select: { nodeId: true, turnIndex: true, versionIndex: true, subTurnIndex: true },
                take: 1,
            },
        },
        take: limit,
    });
    const results = [
        ...messages.map((m) => ({
            convId: m.conversation.deepseekConvId,
            nodeId: m.nodeId,
            title: m.conversation.title,
            content: m.content,
            role: m.role,
            turnIndex: m.turnIndex,
            versionIndex: m.versionIndex,
            subTurnIndex: m.subTurnIndex,
        })),
        ...titleConvs.map((c) => ({
            convId: c.deepseekConvId,
            nodeId: c.messages[0]?.nodeId ?? `title:${c.deepseekConvId}`,
            title: c.title,
            content: c.title,
            role: 'TITLE',
            turnIndex: null,
            versionIndex: null,
            subTurnIndex: null,
        })),
    ];
    return results.slice(0, limit);
}
// GET /api/search/suggest?q=  搜索联想（基于用户对话标题 + 历史搜索）
router.get('/suggest', asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const suggestions = [];
    if (q) {
        // 1. 匹配对话标题前缀/包含
        const convs = await prisma.conversation.findMany({
            where: {
                title: { contains: q },
                config: { userId: req.user.id },
            },
            select: { title: true },
            distinct: ['title'],
            take: limit,
            orderBy: { insertedAt: 'desc' },
        });
        for (const c of convs) {
            suggestions.push({ text: c.title, type: 'conversation' });
        }
    }
    // 2. 用户最近搜索词
    const recent = await prisma.searchQuery.findMany({
        where: q ? { userId: req.user.id, query: { contains: q } } : { userId: req.user.id },
        select: { query: true },
        distinct: ['query'],
        take: limit,
        orderBy: { createdAt: 'desc' },
    });
    for (const r of recent) {
        if (!suggestions.find((s) => s.text === r.query)) {
            suggestions.push({ text: r.query, type: 'history' });
        }
    }
    // 3. 无输入时返回热门搜索词
    if (!q) {
        const popular = await prisma.searchQuery.groupBy({
            by: ['query'],
            where: { userId: req.user.id },
            _count: { _all: true },
            orderBy: { _count: { query: 'desc' } },
            take: limit,
        });
        for (const p of popular) {
            suggestions.push({ text: p.query, type: 'popular' });
        }
    }
    res.json({ suggestions: suggestions.slice(0, limit) });
}));
// AI 过滤器预设（根据用户对话内容自动分类）
const AI_FILTERS = [
    { id: 'code', label: '只看代码相关', keywords: ['code', '代码', 'function', '函数', 'bug', 'error', '报错', '编程', 'React', 'Vue', 'Python', 'TypeScript', 'Java'] },
    { id: 'work', label: '只看工作项目', keywords: ['项目', '工作', '需求', '方案', '会议', '周报', '文档'] },
    { id: 'learning', label: '只看学习笔记', keywords: ['学习', '教程', '笔记', '面试', '算法', '知识点', '复习'] },
    { id: 'recent', label: '近 30 天高价值', keywords: [] }, // 特殊：按时间 + 摘要置信度
];
router.get('/filters', asyncHandler(async (_req, res) => {
    res.json({ filters: AI_FILTERS });
}));
// GET /api/search?q=&configId=&limit=  云端搜索（cloud_v1 + SQL fallback）
router.get('/', asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q)
        return res.status(400).json({ error: '缺少搜索词' });
    const configId = req.query.configId ? Number(req.query.configId) : undefined;
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
    // 记录搜索行为（异步，不阻塞响应）
    prisma.searchQuery.create({
        data: { userId: req.user.id, query: q },
    }).catch(() => { });
    // Try Meilisearch first if enabled
    if (env.meiliEnabled) {
        const { results } = await search(req.user.id, q, { limit, configId });
        if (results.length > 0)
            return res.json({ q, count: results.length, results });
    }
    // SQL LIKE fallback (always run when Meili disabled, or when Meili returned 0)
    const results = await sqlFallbackSearch(req.user.id, q, limit, configId);
    return res.json({ q, count: results.length, results });
}));
export default router;
//# sourceMappingURL=search.routes.js.map