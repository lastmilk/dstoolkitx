/**
 * 对话拆分服务。
 *
 * 重构 git 存储方式：不再直接存储用户的整段 JSON 文件，而是按"轮次 (turn)"拆分。
 *
 * 仓库内布局（拆分存储）：
 *   repo.json                                 —— 仓库元信息 {name, createdAt}
 *   conversations/<convId>/meta.json         —— 对话元信息 {deepseekConvId, title, insertedAt, updatedAt, turnCount}
 *   conversations/<convId>/turns/0001.json   —— 单轮对话 {turnIndex, user:{role,content}, assistant:{role,content} }
 *
 * 优势：
 *  - 粒度更细：增量上传只改变化的 turn 文件，git diff 清晰
 *  - 断电续传：已推送的 turn 不会重做，未完成的可从 payload 续传
 *  - 可读性：仓库内可按目录浏览对话
 */
import AdmZip from 'adm-zip';
import { parseUnifiedMessageJson } from './importService.js';
import { aggregateTurnsFromMessages } from './turns.js';
/**
 * 解压 zip 并从其中的 JSON 提取对话。
 * 支持 DeepSeek 导出包（conversations.json）与统一 message JSON。
 */
export function extractConversationsFromZip(zipBuffer) {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    // 优先查找 conversations.json（DeepSeek 导出包）
    let convEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('conversations.json'));
    let fileName = 'conversations.json';
    // 退化：查找任意 .json
    if (!convEntry) {
        convEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.json') && !e.isDirectory);
        if (convEntry)
            fileName = convEntry.entryName.split('/').pop() || 'data.json';
    }
    if (!convEntry) {
        throw new Error('压缩包内未找到 conversations.json 或其他 JSON 文件');
    }
    const raw = convEntry.getData().toString('utf8');
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        throw new Error(`JSON 解析失败: ${fileName}`);
    }
    // 复用 importService 的统一解析（支持单段/多段/conversations 包装）
    const parsed = parseUnifiedMessageJson(data, 'DEEPSEEK_JSON');
    const conversations = parsed.map((c, i) => splitConversation(c, i));
    return { conversations, fileName };
}
/**
 * 把一个统一对话拆分成 turn 列表。
 * 每个 turn = 一个 user 消息 + 其后紧跟的 assistant 回复（配对）。
 */
export function splitConversation(c, idx) {
    const msgs = c.messages;
    const turns = [];
    let i = 0;
    while (i < msgs.length) {
        const msg = msgs[i];
        if (!msg || !msg.content.trim()) {
            i++;
            continue;
        }
        // user 开启一轮
        if (msg.role === 'USER') {
            const turn = {
                turnIndex: turns.length + 1,
                user: { role: 'user', content: msg.content },
                assistant: null,
            };
            // 找紧随的 assistant
            if (i + 1 < msgs.length && msgs[i + 1] && msgs[i + 1].role === 'ASSISTANT') {
                turn.assistant = { role: 'assistant', content: msgs[i + 1].content };
                i += 2;
            }
            else {
                i++;
            }
            turns.push(turn);
            continue;
        }
        // 孤立的 assistant（无前置 user）→ 单独一轮
        if (msg.role === 'ASSISTANT') {
            turns.push({
                turnIndex: turns.length + 1,
                user: null,
                assistant: { role: 'assistant', content: msg.content },
            });
            i++;
            continue;
        }
        // system / tool 跳过（不进入 turn）
        i++;
    }
    return {
        convId: c.sourceConvId || `conv_${idx + 1}`,
        title: c.title || `对话 ${idx + 1}`,
        insertedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turnCount: turns.length,
        turns,
    };
}
/**
 * 把拆分后的对话构建成 git 仓库文件树（拆分存储，非整段 JSON）。
 */
export function buildRepoFileTree(repoName, conversations) {
    const tree = {};
    tree['repo.json'] = JSON.stringify({ name: repoName, createdAt: new Date().toISOString(), conversationCount: conversations.length }, null, 2);
    for (const c of conversations) {
        const dir = `conversations/${c.convId}`;
        tree[`${dir}/meta.json`] = JSON.stringify({
            deepseekConvId: c.convId,
            title: c.title,
            insertedAt: c.insertedAt,
            updatedAt: c.updatedAt,
            turnCount: c.turnCount,
        }, null, 2);
        for (const t of c.turns) {
            const pad = String(t.turnIndex).padStart(4, '0');
            tree[`${dir}/turns/${pad}.json`] = JSON.stringify(t, null, 2);
        }
    }
    return tree;
}
/** 从已拆分的文件树重建对话（用于读取/导出） */
export function reconstructConversation(convId, metaJson, turnJsons) {
    const meta = JSON.parse(metaJson);
    const turns = turnJsons
        .map((t) => {
        try {
            return JSON.parse(t);
        }
        catch {
            return null;
        }
    })
        .filter(Boolean)
        .sort((a, b) => (a.turnIndex - b.turnIndex));
    return {
        convId,
        title: meta.title || convId,
        insertedAt: meta.insertedAt,
        updatedAt: meta.updatedAt,
        turnCount: meta.turnCount ?? turns.length,
        turns,
    };
}
/**
 * 把拆分后的 SplitConversation 转回 ParsedConversation，
 * 用于双写到 Conversation + Message 表（任务队列在推送 git 后自动同步索引数据源）。
 *
 * 每个 turn 展开为 1~2 条 message（user 在前、assistant 在后），
 * 通过 nodeId/parentId 链式关联以保留轮次结构。
 */
export function splitConvToParsed(c) {
    const insertedAt = new Date(c.insertedAt);
    const updatedAt = new Date(c.updatedAt);
    const messages = [];
    let prevNodeId = null;
    for (const t of c.turns) {
        if (t.user) {
            const userNodeId = `${c.convId}-t${t.turnIndex}-u`;
            messages.push({
                nodeId: userNodeId,
                parentId: prevNodeId,
                role: 'USER',
                model: null,
                content: t.user.content,
                insertedAt,
                turnIndex: t.turnIndex,
                versionIndex: 0,
                subTurnIndex: 0,
            });
            prevNodeId = userNodeId;
        }
        if (t.assistant) {
            const asstNodeId = `${c.convId}-t${t.turnIndex}-a`;
            messages.push({
                nodeId: asstNodeId,
                parentId: prevNodeId,
                role: 'ASSISTANT',
                model: null,
                content: t.assistant.content,
                insertedAt,
                turnIndex: t.turnIndex,
                versionIndex: 0,
                subTurnIndex: 0,
            });
            prevNodeId = asstNodeId;
        }
    }
    return {
        deepseekConvId: c.convId,
        title: c.title,
        insertedAt,
        updatedAt,
        mapping: {},
        messages,
        turns: aggregateTurnsFromMessages(messages),
    };
}
/** 批量转换：把一组 SplitConversation 转为 ParsedConversation（双写用） */
export function splitConvsToParsed(list) {
    return list.map(splitConvToParsed);
}
//# sourceMappingURL=conversationSplitter.js.map