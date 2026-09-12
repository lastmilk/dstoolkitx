import { prisma } from '../utils/prisma.js';
import { indexDocuments, deleteDocuments } from './meilisearch.js';
import { processConversation as buildParsedFromMapping } from './deepseekParser.js';
import { aggregateTurnsFromMessages } from './turns.js';
// 由单个 ParsedConversation 构建该会话的 MeiliDoc[]：
//  - 每条 message 一个文档，id = `msg:${convId}:${nodeId}`
//  - 额外一条 title 文档，id = `title:${convId}`，role='TITLE'，便于按会话标题检索
function buildMeiliDocs(userId, configId, conv) {
    const docs = [];
    const convId = conv.deepseekConvId;
    docs.push({
        id: `title:${convId}`,
        userId,
        configId,
        convId,
        nodeId: `title:${convId}`,
        title: conv.title,
        content: conv.title,
        role: 'TITLE',
        model: null,
        turnIndex: null,
        versionIndex: null,
        subTurnIndex: null,
        insertedAt: conv.insertedAt.toISOString(),
    });
    for (const msg of conv.messages) {
        docs.push({
            id: `msg:${convId}:${msg.nodeId}`,
            userId,
            configId,
            convId,
            nodeId: msg.nodeId,
            title: conv.title,
            content: msg.content,
            role: msg.role,
            model: msg.model,
            turnIndex: msg.turnIndex ?? null,
            versionIndex: msg.versionIndex ?? null,
            subTurnIndex: msg.subTurnIndex ?? null,
            insertedAt: msg.insertedAt.toISOString(),
        });
    }
    return docs;
}
/**
 * 增量 upsert 一批会话到 MySQL（config.routes 上传与 Git 镜像共用）。
 * mapping 版：updatedAt 变化才重建；首次入库全量创建。
 */
export async function upsertConversations(userId, configId, convs) {
    const allNewDocs = [];
    // 批量查询现有会话（消除 N+1 findUnique）
    const existingConvs = await prisma.conversation.findMany({
        where: { configId, deepseekConvId: { in: convs.map((c) => c.deepseekConvId) } },
        select: { id: true, deepseekConvId: true, updatedAt: true },
    });
    const existingMap = new Map(existingConvs.map((c) => [c.deepseekConvId, c]));
    for (const c of convs) {
        const existing = existingMap.get(c.deepseekConvId);
        const messageData = c.messages.map((m) => ({
            nodeId: m.nodeId,
            parentId: m.parentId,
            role: m.role,
            model: m.model,
            content: m.content,
            insertedAt: m.insertedAt,
            turnIndex: m.turnIndex ?? null,
            versionIndex: m.versionIndex ?? null,
            subTurnIndex: m.subTurnIndex ?? null,
        }));
        if (existing) {
            // 增量：仅当 updatedAt 更新时刷新 mapping + 重建 messages
            if (c.updatedAt > existing.updatedAt) {
                // 先抓旧 nodeId，用于清理 Meilisearch 中该会话的旧 msg 文档
                const oldMsgs = await prisma.message.findMany({
                    where: { conversationId: existing.id },
                    select: { nodeId: true },
                });
                const oldDocIds = oldMsgs.map((m) => `msg:${c.deepseekConvId}:${m.nodeId}`);
                await prisma.conversation.update({
                    where: { id: existing.id },
                    data: {
                        title: c.title,
                        insertedAt: c.insertedAt,
                        updatedAt: c.updatedAt,
                        turnCount: c.turns.length,
                        rawMapping: c.mapping,
                        messages: { deleteMany: {}, create: messageData },
                    },
                });
                // 同步 Meilisearch：删旧 msg 文档（title 文档由 addDocuments 覆盖即可）
                try {
                    await deleteDocuments(userId, oldDocIds);
                }
                catch (e) {
                    console.warn('[meilisearch] deleteDocuments during upsert failed', e);
                }
                allNewDocs.push(...buildMeiliDocs(userId, configId, c));
            }
        }
        else {
            await prisma.conversation.create({
                data: {
                    configId,
                    deepseekConvId: c.deepseekConvId,
                    title: c.title,
                    insertedAt: c.insertedAt,
                    updatedAt: c.updatedAt,
                    turnCount: c.turns.length,
                    rawMapping: c.mapping,
                    messages: { create: messageData },
                },
            });
            allNewDocs.push(...buildMeiliDocs(userId, configId, c));
        }
    }
    if (allNewDocs.length > 0) {
        // 非阻塞：后台异步索引，不等待 Meilisearch 返回即可响应上传完成
        setImmediate(() => {
            indexDocuments(userId, allNewDocs).catch((e) => console.warn('[meilisearch] background indexDocuments failed', e));
        });
    }
}
/**
 * 仓库 JSON（conversations/<id>.json）→ ParsedConversation。
 * 支持两种形态：带 mapping（完整树）或仅 messages（扁平消息数组）。
 */
export function repoConversationToParsed(json) {
    if (typeof json !== 'object' || json === null)
        return null;
    const convId = String(json.deepseekConvId || '');
    if (!convId)
        return null;
    const title = typeof json.title === 'string' ? json.title : '(无标题)';
    const insertedAt = json.inserted_at ? new Date(json.inserted_at) : new Date();
    const updatedAt = json.updated_at ? new Date(json.updated_at) : new Date();
    if (json.mapping && typeof json.mapping === 'object') {
        // 完整 mapping 树 → 复用 Deepseek 解析器
        return buildParsedFromMapping({
            id: convId,
            title,
            inserted_at: json.inserted_at,
            updated_at: json.updated_at,
            mapping: json.mapping,
        });
    }
    // 扁平 messages 数组
    const rawMessages = Array.isArray(json.messages) ? json.messages : [];
    const messages = rawMessages
        .filter((m) => m && typeof m.content === 'string' && m.nodeId != null)
        .map((m) => ({
        nodeId: String(m.nodeId),
        parentId: m.parentId != null ? String(m.parentId) : null,
        role: m.role === 'ASSISTANT' || m.role === 'RESPONSE' ? 'ASSISTANT' : 'USER',
        model: typeof m.model === 'string' ? m.model : null,
        content: m.content,
        insertedAt: m.insertedAt ? new Date(m.insertedAt) : insertedAt,
    }));
    return {
        deepseekConvId: convId,
        title,
        insertedAt,
        updatedAt,
        mapping: (json.mapping ?? {}),
        messages,
        turns: aggregateTurnsFromMessages(messages),
    };
}
//# sourceMappingURL=conversationStore.js.map