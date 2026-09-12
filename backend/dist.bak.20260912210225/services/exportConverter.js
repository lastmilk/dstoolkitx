/**
 * 多样化导出转换器。
 *
 * 取代旧版仅支持 Alpaca 的单一导出，支持：
 *  - json     原始对话 JSON
 *  - csv      扁平 CSV（每行一轮对话：convId,title,turnIndex,role,content）
 *  - markdown 人类可读 Markdown 文档
 *  - html     带样式 HTML 文档（可直接浏览器打开）
 *  - alpaca-single  Alpaca 单轮 instruction/output
 *  - alpaca-multi   Alpaca 多轮 conversations
 */
// ═══════════ CSV ═══════════
function escapeCsv(s) {
    if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
export function toCsv(convs) {
    const rows = ['convId,title,turnIndex,role,model,content'];
    for (const c of convs) {
        let turnIdx = 0;
        for (const m of c.messages) {
            if (m.role === 'USER')
                turnIdx++;
            rows.push([
                escapeCsv(c.deepseekConvId),
                escapeCsv(c.title),
                String(turnIdx),
                escapeCsv(m.role),
                escapeCsv(m.model || ''),
                escapeCsv(m.content),
            ].join(','));
        }
    }
    return rows.join('\n');
}
// ═══════════ Markdown ═══════════
function escapeMd(s) {
    return s.replace(/`/g, '\\`');
}
export function toMarkdown(convs) {
    const parts = [];
    parts.push(`# 对话记录导出\n`);
    parts.push(`> 共 ${convs.length} 个对话 · 生成于 ${new Date().toISOString()}\n`);
    for (const c of convs) {
        parts.push(`\n---\n`);
        parts.push(`## ${escapeMd(c.title)}`);
        parts.push(`*对话ID: \`${c.deepseekConvId}\`*\n`);
        let turnIdx = 0;
        for (const m of c.messages) {
            if (m.role === 'USER') {
                turnIdx++;
                parts.push(`\n### 第 ${turnIdx} 轮`);
                parts.push(`**🧑 用户：**\n\n${escapeMd(m.content)}\n`);
            }
            else if (m.role === 'ASSISTANT') {
                parts.push(`**🤖 助手${m.model ? ` (${m.model})` : ''}：**\n\n${escapeMd(m.content)}\n`);
            }
            else {
                parts.push(`**${m.role}：**\n\n${escapeMd(m.content)}\n`);
            }
        }
    }
    return parts.join('\n');
}
// ═══════════ HTML ═══════════
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function contentToHtml(content) {
    // 简单换行处理
    return escapeHtml(content).replace(/\n/g, '<br>');
}
export function toHtml(convs) {
    const cards = convs.map((c) => {
        let turnIdx = 0;
        const msgs = c.messages.map((m) => {
            if (m.role === 'USER')
                turnIdx++;
            const role = m.role === 'USER' ? 'user' : m.role === 'ASSISTANT' ? 'assistant' : 'other';
            const badge = m.role === 'USER' ? '🧑 用户' : m.role === 'ASSISTANT' ? `🤖 助手${m.model ? ` · ${m.model}` : ''}` : m.role;
            return `<div class="msg ${role}"><span class="badge">${badge}</span><div class="content">${contentToHtml(m.content)}</div></div>`;
        }).join('');
        return `<div class="conv-card"><h2>${escapeHtml(c.title)}</h2><div class="conv-meta">对话ID: <code>${escapeHtml(c.deepseekConvId)}</code></div><div class="msg-list">${msgs}</div></div>`;
    }).join('');
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>对话记录导出</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;color:#303133;margin:0;padding:24px}
.container{max-width:860px;margin:0 auto}
h1{text-align:center;color:#409eff;margin-bottom:8px}
.meta{text-align:center;color:#909399;font-size:14px;margin-bottom:32px}
.conv-card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.06);padding:24px;margin-bottom:24px}
.conv-card h2{margin:0 0 8px;font-size:20px;color:#303133}
.conv-meta{font-size:13px;color:#909399;margin-bottom:16px}
.msg{margin-bottom:16px;padding:12px 16px;border-radius:8px}
.msg.user{background:#ecf5ff;border-left:3px solid #409eff}
.msg.assistant{background:#f0f9eb;border-left:3px solid #67c23a}
.msg.other{background:#f4f4f5;border-left:3px solid #909399}
.badge{display:inline-block;font-size:13px;font-weight:600;margin-bottom:6px}
.content{line-height:1.7;white-space:pre-wrap;word-break:break-word}
</style></head><body><div class="container">
<h1>🤖 对话记录导出</h1>
<div class="meta">共 ${convs.length} 个对话 · 生成于 ${new Date().toISOString()}</div>
${cards}
</div></body></html>`;
}
// ═══════════ Alpaca ═══════════
export function toAlpacaSingle(convs) {
    const out = [];
    for (const c of convs) {
        for (let i = 0; i + 1 < c.messages.length; i++) {
            const cur = c.messages[i];
            const next = c.messages[i + 1];
            if (cur && next && cur.role === 'USER' && next.role === 'ASSISTANT') {
                out.push({ instruction: cur.content, input: '', output: next.content });
            }
        }
    }
    return out;
}
export function toAlpacaMulti(convs) {
    return convs.map((c) => ({
        conversations: c.messages.map((m) => ({
            role: m.role === 'USER' ? 'user' : 'assistant',
            content: m.content,
        })),
    }));
}
// ═══════════ 原始 JSON ═══════════
export function toJson(convs) {
    return convs.map((c) => ({
        deepseekConvId: c.deepseekConvId,
        title: c.title,
        insertedAt: c.insertedAt,
        updatedAt: c.updatedAt,
        messages: c.messages,
    }));
}
/** 按格式转换，返回 { content, contentType, fileExt } */
export function convert(format, convs) {
    switch (format) {
        case 'json':
            return {
                content: JSON.stringify(toJson(convs), null, 2),
                contentType: 'application/json; charset=utf-8',
                fileExt: 'json',
            };
        case 'csv':
            return {
                content: '\ufeff' + toCsv(convs),
                contentType: 'text/csv; charset=utf-8',
                fileExt: 'csv',
            };
        case 'markdown':
            return {
                content: toMarkdown(convs),
                contentType: 'text/markdown; charset=utf-8',
                fileExt: 'md',
            };
        case 'html':
            return {
                content: toHtml(convs),
                contentType: 'text/html; charset=utf-8',
                fileExt: 'html',
            };
        case 'alpaca-single':
            return {
                content: JSON.stringify(toAlpacaSingle(convs), null, 2),
                contentType: 'application/json; charset=utf-8',
                fileExt: 'json',
            };
        case 'alpaca-multi':
            return {
                content: JSON.stringify(toAlpacaMulti(convs), null, 2),
                contentType: 'application/json; charset=utf-8',
                fileExt: 'json',
            };
        default:
            throw new Error(`不支持的导出格式: ${format}`);
    }
}
export const EXPORT_FORMATS = [
    { id: 'json', name: 'JSON', desc: '原始对话 JSON，完整保留消息结构', ext: 'json' },
    { id: 'csv', name: 'CSV', desc: '扁平表格，每行一轮消息，适合 Excel 分析', ext: 'csv' },
    { id: 'markdown', name: 'Markdown', desc: '人类可读文档，适合归档与阅读', ext: 'md' },
    { id: 'html', name: 'HTML', desc: '带样式网页，可直接浏览器打开', ext: 'html' },
    { id: 'alpaca-single', name: 'Alpaca 单轮', desc: 'instruction/output 格式，模型微调用', ext: 'json' },
    { id: 'alpaca-multi', name: 'Alpaca 多轮', desc: 'conversations 格式，多轮微调用', ext: 'json' },
];
//# sourceMappingURL=exportConverter.js.map