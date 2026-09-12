import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { toAlpacaSingle, toAlpacaMulti } from '../services/alpacaConverter.js';
const router = Router();
router.use(verifyJwt);
async function loadForAlpaca(userId, configId, conversationIds) {
    const convWhere = { configId, config: { userId } };
    if (conversationIds && conversationIds.length) {
        convWhere.id = { in: conversationIds };
    }
    const convs = await prisma.conversation.findMany({
        where: convWhere,
        include: {
            messages: {
                orderBy: { insertedAt: 'asc' },
                select: { role: true, content: true, insertedAt: true },
            },
        },
        orderBy: { insertedAt: 'asc' },
    });
    return convs.map((c) => ({
        deepseekConvId: c.deepseekConvId,
        title: c.title,
        messages: c.messages.map((m) => ({
            nodeId: '',
            parentId: null,
            role: m.role === 'USER' ? 'USER' : 'ASSISTANT',
            model: null,
            content: m.content,
            insertedAt: m.insertedAt,
        })),
    }));
}
// POST /api/alpaca/convert?configId=&conversationIds=&multiTurn=true
router.post('/convert', asyncHandler(async (req, res) => {
    const configId = Number(req.query.configId);
    if (!configId)
        return res.status(400).json({ error: '缺少 configId' });
    const multiTurn = String(req.query.multiTurn).toLowerCase() === 'true';
    const conversationIds = Array.isArray(req.query.conversationIds)
        ? req.query.conversationIds.map(Number)
        : req.query.conversationIds
            ? [Number(req.query.conversationIds)]
            : undefined;
    const convs = await loadForAlpaca(req.user.id, configId, conversationIds);
    const data = multiTurn ? toAlpacaMulti(convs) : toAlpacaSingle(convs);
    return res.json({ count: data.length, data });
}));
// GET /api/alpaca/download?configId=&conversationIds=&multiTurn=true
router.get('/download', asyncHandler(async (req, res) => {
    const configId = Number(req.query.configId);
    if (!configId)
        return res.status(400).json({ error: '缺少 configId' });
    const multiTurn = String(req.query.multiTurn).toLowerCase() === 'true';
    const conversationIds = Array.isArray(req.query.conversationIds)
        ? req.query.conversationIds.map(Number)
        : req.query.conversationIds
            ? [Number(req.query.conversationIds)]
            : undefined;
    const convs = await loadForAlpaca(req.user.id, configId, conversationIds);
    const data = multiTurn ? toAlpacaMulti(convs) : toAlpacaSingle(convs);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="alpaca-${Date.now()}.json"`);
    return res.send(Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
}));
export default router;
//# sourceMappingURL=alpaca.routes.js.map