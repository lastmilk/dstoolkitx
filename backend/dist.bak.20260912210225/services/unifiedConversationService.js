import { prisma } from '../utils/prisma.js';
/**
 * 创建统一对话（含消息）。
 */
export async function createUnifiedConversation(input) {
    const turnCount = input.messages.filter((m) => m.role === 'USER').length;
    return prisma.unifiedConversation.create({
        data: {
            userId: input.userId,
            title: input.title,
            source: input.source,
            sourceUrl: input.sourceUrl,
            sourceConvId: input.sourceConvId,
            model: input.model,
            turnCount,
            messages: {
                create: input.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    model: m.model,
                    toolName: m.toolName,
                    toolCallId: m.toolCallId,
                    toolCalls: m.toolCalls,
                })),
            },
        },
        select: {
            id: true,
            title: true,
            source: true,
            model: true,
            turnCount: true,
            createdAt: true,
            updatedAt: true,
        },
    });
}
/**
 * 向已有统一对话追加消息（续聊时使用）。
 */
export async function appendMessages(conversationId, messages) {
    const created = await prisma.unifiedMessage.createMany({
        data: messages.map((m) => ({
            conversationId,
            role: m.role,
            content: m.content,
            model: m.model,
            toolName: m.toolName,
            toolCallId: m.toolCallId,
            toolCalls: m.toolCalls,
        })),
    });
    // 更新 turnCount
    const userCount = await prisma.unifiedMessage.count({
        where: { conversationId, role: 'USER' },
    });
    await prisma.unifiedConversation.update({
        where: { id: conversationId },
        data: { turnCount: userCount, updatedAt: new Date() },
    });
    return created;
}
/**
 * 加载统一对话的消息，转换为 AI 客户端可用的 ChatMessage[]。
 */
export async function loadConversationForAI(conversationId) {
    const conv = await prisma.unifiedConversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { messages: { orderBy: { insertedAt: 'asc' } } },
    });
    const messages = conv.messages.map((m) => {
        const msg = {
            role: m.role.toLowerCase(),
            content: m.content,
        };
        if (m.toolName)
            msg.name = m.toolName;
        if (m.toolCallId)
            msg.tool_call_id = m.toolCallId;
        if (m.toolCalls)
            msg.tool_calls = m.toolCalls;
        return msg;
    });
    return { conversation: conv, messages };
}
/**
 * 列出用户的统一对话（分页）。
 */
export async function listUserConversations(userId, opts = {}) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 50;
    const where = { userId };
    if (opts.source)
        where.source = opts.source;
    const [convs, total] = await Promise.all([
        prisma.unifiedConversation.findMany({
            where,
            select: {
                id: true,
                title: true,
                source: true,
                model: true,
                turnCount: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { messages: true } },
            },
            orderBy: { updatedAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.unifiedConversation.count({ where }),
    ]);
    return { conversations: convs, total, page, pageSize };
}
//# sourceMappingURL=unifiedConversationService.js.map