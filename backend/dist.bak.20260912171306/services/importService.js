export function detectSharePlatform(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        if (host.includes('deepseek.com'))
            return 'deepseek';
        if (host.includes('chat.openai.com') || host.includes('openai.com'))
            return 'openai';
        if (host.includes('chatgpt.com'))
            return 'openai';
    }
    catch {
        // 非法 URL
    }
    return 'unknown';
}
/**
 * 从分享链接中提取会话 ID（用于增量导入的去重判断）。
 */
export function extractConvIdFromShareUrl(url) {
    try {
        const u = new URL(url);
        const path = u.pathname;
        // DeepSeek: /chat/{id} 或 /share/{id}
        const dsMatch = path.match(/\/(?:chat|share|conversation)\/([a-zA-Z0-9_-]+)/);
        if (dsMatch)
            return dsMatch[1];
        // OpenAI/ChatGPT: /share/{id} 或 /c/{id}
        const oaMatch = path.match(/\/(?:share|c)\/([a-zA-Z0-9_-]+)/);
        if (oaMatch)
            return oaMatch[1];
    }
    catch {
        // ignore
    }
    return null;
}
/**
 * 将 content 字段统一抽取为纯文本。
 * OpenAI 兼容格式中 content 可能是字符串或数组（多模态）。
 */
function contentToText(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
            if (typeof part === 'string')
                return part;
            if (part && typeof part === 'object' && 'text' in part)
                return String(part.text || '');
            return '';
        })
            .join('');
    }
    return '';
}
function mapRole(role) {
    switch (role.toLowerCase()) {
        case 'system':
            return 'SYSTEM';
        case 'assistant':
            return 'ASSISTANT';
        case 'tool':
            return 'TOOL';
        default:
            return 'USER';
    }
}
/**
 * 解析 OpenAI/DeepSeek 统一 message JSON 格式。
 * 支持两种顶层结构：
 *  1. { messages: [...] }                  —— 单段对话
 *  2. [ { messages: [...] }, ... ]         —— 多段对话数组
 *  3. { conversations: [ { messages: [...] } ] }  —— 带 conversations 包装
 */
export function parseUnifiedMessageJson(data, source) {
    const conversations = [];
    const normalizeConv = (obj, idx) => {
        if (!obj || typeof obj !== 'object')
            return null;
        const rawMessages = Array.isArray(obj.messages)
            ? obj.messages
            : Array.isArray(obj.conversation)
                ? obj.conversation
                : [];
        if (rawMessages.length === 0)
            return null;
        const messages = rawMessages
            .filter((m) => m && typeof m.content !== 'undefined')
            .map((m) => ({
            role: mapRole(m.role),
            content: contentToText(m.content),
        }))
            .filter((m) => m.content.trim().length > 0);
        if (messages.length === 0)
            return null;
        const title = typeof obj.title === 'string'
            ? obj.title
            : messages.find((m) => m.role === 'USER')?.content.slice(0, 50) || `对话 ${idx + 1}`;
        return {
            sourceConvId: obj.id ? String(obj.id) : undefined,
            title,
            messages,
        };
    };
    // 多段数组
    if (Array.isArray(data)) {
        data.forEach((item, idx) => {
            const conv = normalizeConv(item, idx);
            if (conv)
                conversations.push(conv);
        });
        return conversations;
    }
    if (data && typeof data === 'object') {
        // conversations 包装
        if (Array.isArray(data.conversations)) {
            ;
            data.conversations.forEach((item, idx) => {
                const conv = normalizeConv(item, idx);
                if (conv)
                    conversations.push(conv);
            });
            return conversations;
        }
        // 单段
        const conv = normalizeConv(data, 0);
        if (conv)
            conversations.push(conv);
    }
    return conversations;
}
// ═══════════ 分享链接内容抓取（服务端代理） ═══════════
/**
 * 尝试从分享链接抓取对话内容。
 * 注意：多数平台分享页需要 JS 渲染，这里做基础抓取 + 降级。
 * 返回 null 表示无法自动抓取，提示用户手动粘贴 JSON。
 */
export async function fetchShareConversation(url) {
    const platform = detectSharePlatform(url);
    if (platform === 'unknown')
        return null;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
            },
        });
        if (!res.ok)
            return null;
        const html = await res.text();
        // 尝试从 HTML 中提取嵌入的 JSON 数据
        const jsonMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[1]);
                const conv = extractFromNextData(data, platform);
                if (conv)
                    return { platform, conv };
            }
            catch {
                // ignore parse error
            }
        }
        // 尝试提取 <title> 作为降级
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const title = titleMatch ? titleMatch[1] : '分享对话';
        return {
            platform,
            conv: {
                sourceConvId: extractConvIdFromShareUrl(url) || undefined,
                title,
                messages: [{ role: 'USER', content: `（从分享链接导入：${url}）请使用 JSON 全量导入获取完整对话内容。` }],
                sourceUrl: url,
            },
        };
    }
    catch {
        return null;
    }
}
function extractFromNextData(data, platform) {
    // 递归查找包含 messages 的对象
    const found = findMessagesObject(data);
    if (!found)
        return null;
    const source = platform === 'deepseek' ? 'DEEPSEEK_JSON' : 'OPENAI_JSON';
    const convs = parseUnifiedMessageJson(found, source);
    return convs[0] || null;
}
function findMessagesObject(obj, depth = 0) {
    if (!obj || depth > 10)
        return null;
    if (Array.isArray(obj?.messages) && obj.messages.length > 0)
        return obj;
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') {
            const found = findMessagesObject(val, depth + 1);
            if (found)
                return found;
        }
    }
    return null;
}
export function sourceToEnum(platform) {
    return platform === 'deepseek' ? 'DEEPSEEK_SHARE' : 'OPENAI_SHARE';
}
//# sourceMappingURL=importService.js.map