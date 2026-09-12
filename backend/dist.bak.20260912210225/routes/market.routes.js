import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt, requireAdmin } from '../middleware/auth.js';
const router = Router();
// 列表（需登录）
router.get('/', verifyJwt, asyncHandler(async (req, res) => {
    const entries = await prisma.appMarketEntry.findMany({ orderBy: { createdAt: 'asc' } });
    return res.json({ entries });
}));
const entrySchema = z.object({
    name: z.string().min(1),
    url: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
});
router.post('/', verifyJwt, requireAdmin, asyncHandler(async (req, res) => {
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const created = await prisma.appMarketEntry.create({
        data: { ...parsed.data, category: parsed.data.category || 'official' },
    });
    return res.json({ entry: created });
}));
router.put('/:id', verifyJwt, requireAdmin, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parsed = entrySchema.partial().safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const updated = await prisma.appMarketEntry.update({ where: { id }, data: parsed.data });
    return res.json({ entry: updated });
}));
router.delete('/:id', verifyJwt, requireAdmin, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.appMarketEntry.delete({ where: { id } });
    return res.json({ ok: true });
}));
export default router;
//# sourceMappingURL=market.routes.js.map