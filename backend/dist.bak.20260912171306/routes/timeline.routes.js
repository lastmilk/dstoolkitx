import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
const router = Router();
router.use(verifyJwt);
// 用 +08:00（用户时区）切片，避免服务器时区影响
function cnParts(d) {
    const u = new Date(d.getTime() + 8 * 3600 * 1000);
    return { date: u.toISOString().slice(0, 10) };
}
router.get('/', asyncHandler(async (req, res) => {
    const configId = req.query.configId ? Number(req.query.configId) : undefined;
    const type = String(req.query.type || 'by_day');
    const convWhere = configId
        ? { configId, config: { userId: req.user.id } }
        : { config: { userId: req.user.id } };
    if (type === 'by_session') {
        const convs = await prisma.conversation.findMany({
            where: convWhere,
            select: { id: true, title: true, insertedAt: true, updatedAt: true, _count: { select: { messages: true } } },
            orderBy: { insertedAt: 'asc' },
            take: 500,
        });
        return res.json({
            type,
            items: convs.map((c) => ({
                id: c.id,
                title: c.title,
                insertedAt: c.insertedAt,
                updatedAt: c.updatedAt,
                messageCount: c._count.messages,
            })),
        });
    }
    if (type === 'by_model') {
        const msgs = await prisma.message.findMany({
            where: { conversation: convWhere, model: { not: null } },
            select: { model: true, insertedAt: true },
            take: 50000,
        });
        const map = new Map();
        for (const m of msgs) {
            const date = cnParts(m.insertedAt).date;
            const model = m.model || 'unknown';
            const key = `${date}|${model}`;
            const cur = map.get(key) || { date, model, count: 0 };
            cur.count++;
            map.set(key, cur);
        }
        return res.json({ type, items: Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)) });
    }
    // by_day
    const convs = await prisma.conversation.findMany({
        where: convWhere,
        select: { insertedAt: true },
        orderBy: { insertedAt: 'asc' },
        take: 5000,
    });
    const map = new Map();
    for (const c of convs) {
        const k = cnParts(c.insertedAt).date;
        map.set(k, (map.get(k) || 0) + 1);
    }
    return res.json({
        type,
        items: Array.from(map.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
    });
}));
export default router;
//# sourceMappingURL=timeline.routes.js.map