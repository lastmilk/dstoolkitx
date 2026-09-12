import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { asyncHandler } from '../utils/async.js';
import { verifyJwt } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { hit } from '../utils/ratelimit.js';
import { callDeepseek, DEEPSEEK_MODELS } from '../services/aiClient.js';
import { appendMessages, createUnifiedConversation, listUserConversations, loadConversationForAI, } from '../services/unifiedConversationService.js';
const router = Router();
router.use(verifyJwt);
// GET /api/continue-chat  列出续聊对话
router.get('/', asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;
    const result = await listUserConversations(req.user.id, {
        page,
        pageSize,
        source: 'CONTINUED',
    });
    res.json(result);
}));
// POST /api/continue-chat  新建续聊对话
const createSchema = z.object({
    title: z.string().min(1).max(200),
    messages: z
        .array(z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
    }))
        .min(1),
    model: z.enum([DEEPSEEK_MODELS.chat, DEEPSEEK_MODELS.reasoner]).default(DEEPSEEK_MODELS.chat),
});
router.post('/', asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: '参数错误', details: parsed.error.flatten() });
    const { title, messages, model } = parsed.data;
    const conv = await createUnifiedConversation({
        userId: req.user.id,
        title,
        source: 'CONTINUED',
        model,
        messages: messages.map((m) => ({
            role: m.role.toUpperCase(),
            content: m.content,
            model,
        })),
    });
    res.json({ conversation: conv });
}));
// GET /api/continue-chat/:id  获取对话详情（含消息）
router.get('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const conv = await prisma.unifiedConversation.findFirst({
        where: { id, userId: req.user.id },
        include: { messages: { orderBy: { insertedAt: 'asc' } } },
    });
    if (!conv)
        return res.status(404).json({ error: '对话不存在' });
    res.json({ conversation: conv });
}));
// POST /api/continue-chat/:id/message  发送续聊消息（SSE 流式）
router.post('/:id/message', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { content, model } = req.body;
    if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: '请输入消息内容' });
    }
    const conv = await prisma.unifiedConversation.findFirst({
        where: { id, userId: req.user.id },
    });
    if (!conv)
        return res.status(404).json({ error: '对话不存在' });
    // 每小时限流：不设额度，仅限速
    const rateKey = `continue-chat:${req.user.id}`;
    const allowed = hit(rateKey, 60 * 60 * 1000, env.continueChatRatePerHour);
    if (!allowed) {
        return res.status(429).json({
            error: `续聊请求过于频繁，每小时最多 ${env.continueChatRatePerHour} 次，请稍后再试`,
            rateLimit: { limit: env.continueChatRatePerHour, window: '1h' },
        });
    }
    const useModel = model || conv.model || DEEPSEEK_MODELS.chat;
    // 加载历史消息
    const { messages } = await loadConversationForAI(id);
    messages.push({ role: 'user', content });
    // SSE 响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let fullContent = '';
    try {
        const result = await callDeepseek({
            model: useModel,
            messages,
            onDelta: (delta) => {
                fullContent += delta;
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            },
        });
        fullContent = result.content || fullContent;
        // 持久化：用户消息 + AI 回复
        await appendMessages(id, [
            { role: 'USER', content, model: useModel },
            { role: 'ASSISTANT', content: fullContent, model: result.model },
        ]);
        res.write(`data: ${JSON.stringify({ done: true, model: result.model })}\n\n`);
    }
    catch (e) {
        res.write(`data: ${JSON.stringify({ error: e?.message || '续聊失败' })}\n\n`);
    }
    finally {
        res.end();
    }
}));
export default router;
//# sourceMappingURL=continueChat.routes.js.map