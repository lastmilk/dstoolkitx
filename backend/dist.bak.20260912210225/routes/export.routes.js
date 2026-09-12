/**
 * 多样化导出路由（取代旧版 Alpaca 单一导出）。
 *
 *   GET  /api/export/formats            支持的导出格式列表
 *   POST /api/export/preview            预览转换结果（返回 JSON 数据，不下载）
 *   GET  /api/export/download           下载文件（format + configId + conversationIds）
 *
 * 支持格式：json / csv / markdown / html / alpaca-single / alpaca-multi
 */
import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { convert, EXPORT_FORMATS } from '../services/exportConverter.js';
const router = Router();
router.use(verifyJwt);
async function loadConversations(userId, configId, conversationIds) {
    const convWhere = { configId, config: { userId } };
    if (conversationIds && conversationIds.length) {
        convWhere.id = { in: conversationIds };
    }
    const convs = await prisma.conversation.findMany({
        where: convWhere,
        include: {
            messages: {
                orderBy: { insertedAt: 'asc' },
                select: { role: true, content: true, model: true, insertedAt: true },
            },
        },
        orderBy: { insertedAt: 'asc' },
    });
    return convs.map((c) => ({
        deepseekConvId: c.deepseekConvId,
        title: c.title,
        insertedAt: c.insertedAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        messages: c.messages.map((m) => ({
            role: m.role,
            content: m.content,
            model: m.model,
            insertedAt: m.insertedAt.toISOString(),
        })),
    }));
}
function parseConvIds(req) {
    if (Array.isArray(req.query.conversationIds)) {
        return req.query.conversationIds.map(Number);
    }
    if (req.query.conversationIds) {
        return [Number(req.query.conversationIds)];
    }
    return undefined;
}
// GET /api/export/formats
router.get('/formats', (_req, res) => {
    res.json({ formats: EXPORT_FORMATS });
});
// POST /api/export/preview  预览（body: { configId, conversationIds?, format, limit? }）
router.post('/preview', asyncHandler(async (req, res) => {
    const { configId, format, limit } = req.body;
    if (!configId)
        return res.status(400).json({ error: '缺少 configId' });
    if (!format)
        return res.status(400).json({ error: '缺少 format' });
    const convs = await loadConversations(req.user.id, configId);
    const previewConvs = limit ? convs.slice(0, limit) : convs.slice(0, 2);
    const result = convert(format, previewConvs);
    res.json({
        format,
        previewCount: previewConvs.length,
        totalCount: convs.length,
        content: result.content.slice(0, 4000), // 截断预览
        fileExt: result.fileExt,
    });
}));
// GET /api/export/download?configId=&format=&conversationIds=
router.get('/download', asyncHandler(async (req, res) => {
    const configId = Number(req.query.configId);
    const format = String(req.query.format || 'json');
    if (!configId)
        return res.status(400).json({ error: '缺少 configId' });
    const conversationIds = parseConvIds(req);
    const convs = await loadConversations(req.user.id, configId, conversationIds);
    if (convs.length === 0)
        return res.status(400).json({ error: '没有可导出的对话' });
    const result = convert(format, convs);
    const filename = `export-${format}-${Date.now()}.${result.fileExt}`;
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(result.content, 'utf8'));
}));
export default router;
//# sourceMappingURL=export.routes.js.map