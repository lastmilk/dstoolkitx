import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../utils/crypto.js';
const router = Router();
router.use(verifyJwt);
router.get('/', asyncHandler(async (req, res) => {
    const keys = await prisma.apiKey.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
    });
    return res.json({
        apiKeys: keys.map((k) => ({
            id: k.id,
            name: k.name,
            masked: maskApiKey(decryptApiKey(k.keyCipher)),
            createdAt: k.createdAt,
        })),
    });
}));
const createSchema = z.object({ name: z.string().min(1), key: z.string().min(1) });
router.post('/', asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误' });
    const { name, key } = parsed.data;
    try {
        const created = await prisma.apiKey.create({
            data: { userId: req.user.id, name, keyCipher: encryptApiKey(key.trim()) },
        });
        return res.json({ id: created.id, name: created.name });
    }
    catch (e) {
        if (e?.code === 'P2002')
            return res.status(409).json({ error: '同名 API Key 已存在' });
        throw e;
    }
}));
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const k = await prisma.apiKey.findFirst({ where: { id, userId: req.user.id } });
    if (!k)
        return res.status(404).json({ error: '不存在' });
    await prisma.apiKey.delete({ where: { id } });
    return res.json({ ok: true });
}));
export default router;
//# sourceMappingURL=apikey.routes.js.map