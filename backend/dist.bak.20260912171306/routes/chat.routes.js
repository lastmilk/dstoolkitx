import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { decryptApiKey } from '../utils/crypto.js';
import { env } from '../config/env.js';
const router = Router();
router.use(verifyJwt);
const chatSchema = z.object({
    keyId: z.number().int().positive(),
    model: z.enum(['deepseek-chat', 'deepseek-reasoner']).default('deepseek-chat'),
    messages: z.array(z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
    })).min(1),
});
// POST /api/chat  - SSE streaming proxy to Deepseek /chat/completions
router.post('/', asyncHandler(async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误', details: parsed.error.flatten() });
    const { keyId, model, messages } = parsed.data;
    const apiKey = await prisma.apiKey.findFirst({ where: { id: keyId, userId: req.user.id } });
    if (!apiKey)
        return res.status(404).json({ error: 'API Key 不存在' });
    const plainKey = decryptApiKey(apiKey.keyCipher);
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();
    // Call Deepseek chat completions with stream=true
    const upstream = await fetch(`${env.deepseekApiBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${plainKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        res.write(`data: ${JSON.stringify({ error: `Deepseek API 错误 (${upstream.status}): ${errText || upstream.statusText}` })}\n\n`);
        res.end();
        return;
    }
    if (!upstream.body) {
        res.write(`data: ${JSON.stringify({ error: 'Deepseek 返回空响应' })}\n\n`);
        res.end();
        return;
    }
    // Pipe the SSE stream from Deepseek to the client
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
        }
    }
    catch (e) {
        // Client disconnected or upstream error
        res.write(`data: ${JSON.stringify({ error: e?.message || '流式传输中断' })}\n\n`);
    }
    finally {
        res.end();
    }
}));
export default router;
//# sourceMappingURL=chat.routes.js.map