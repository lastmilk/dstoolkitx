import { prisma } from '../utils/prisma.js';
import { callStepfun } from './aiClient.js';
// ═══════════ 加载用户 Skill 与 MCP ═══════════
/**
 * 加载用户启用的 Skill.md，拼接为系统提示的一部分。
 */
export async function loadUserSkills(userId) {
    const skills = await prisma.skill.findMany({
        where: { userId, enabled: true },
        orderBy: { updatedAt: 'desc' },
    });
    if (skills.length === 0)
        return '';
    const parts = skills.map((s) => `# Skill: ${s.name}\n${s.description ? `描述：${s.description}\n` : ''}\n${s.content}`);
    return `\n\n═══ 你拥有以下技能（Skills），在适当时调用 ═══\n\n${parts.join('\n\n---\n\n')}`;
}
/**
 * 加载用户启用的 MCP 服务器，转换为 StepFun 可用的 tools 定义。
 * 注：完整的 MCP 工具发现需要实际连接 MCP 服务器；此处先支持 HTTP 模式的
 * 简单 tool schema 声明，实际调用由 executeMcpTool 代理。
 */
export async function loadUserMcpTools(userId) {
    const servers = await prisma.mcpServer.findMany({
        where: { userId, enabled: true },
    });
    const tools = [];
    for (const server of servers) {
        // 约定：每个 MCP 服务器暴露一个通用调用工具，参数为 toolName + args
        tools.push({
            type: 'function',
            function: {
                name: `mcp_${sanitizeName(server.name)}`,
                description: server.description || `调用 MCP 服务器 ${server.name} 的工具`,
                parameters: {
                    type: 'object',
                    properties: {
                        toolName: { type: 'string', description: '要调用的 MCP 工具名称' },
                        args: { type: 'object', description: '工具参数' },
                    },
                    required: ['toolName'],
                },
            },
            mcpServerId: server.id,
        });
    }
    return tools;
}
function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}
// ═══════════ MCP 工具执行（HTTP 代理） ═══════════
/**
 * 执行 MCP 工具调用。
 * 目前实现 HTTP 模式：向 MCP 服务器的 /tools/call endpoint POST 请求。
 * STDIO 模式需要启动子进程，此处预留接口。
 */
export async function executeMcpTool(server, toolName, args) {
    if (server.transport === 'HTTP' && server.url) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (server.headers && typeof server.headers === 'object') {
                Object.assign(headers, server.headers);
            }
            const res = await fetch(`${server.url.replace(/\/$/, '')}/tools/call`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: toolName, arguments: args }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                return `MCP 调用失败 (${res.status}): ${text || res.statusText}`;
            }
            const data = await res.json().catch(async () => ({ result: await res.text() }));
            return typeof data === 'string' ? data : JSON.stringify(data);
        }
        catch (e) {
            return `MCP 调用异常：${e?.message || String(e)}`;
        }
    }
    // STDIO 模式：暂未实现子进程管理，返回提示
    return `MCP 服务器 ${server.name} 使用 STDIO 传输，当前版本暂不支持自动执行。请通过 HTTP 模式配置。`;
}
/**
 * 运行 Agent 对话循环：
 * 1. 加载用户 Skills 注入 system prompt
 * 2. 加载用户 MCP tools 注入 tools
 * 3. 调用 StepFun
 * 4. 若有 tool_calls，执行并回填 tool 消息，继续循环
 * 5. 直到无 tool_calls 或达到最大迭代次数
 */
export async function runAgent(opts) {
    const { userId, messages, model = 'step-1o', onDelta, maxIterations = 5 } = opts;
    // 加载 Skills
    const skillsText = await loadUserSkills(userId);
    const systemPrompt = `你是一个智能助手，可以使用技能（Skills）和 MCP 工具来帮助用户。${skillsText}`;
    // 构建带 system 的消息列表
    const workingMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
    ];
    // 加载 MCP tools
    const tools = await loadUserMcpTools(userId);
    const mcpServerMap = new Map();
    for (const t of tools) {
        if (t.mcpServerId) {
            const server = await prisma.mcpServer.findUnique({ where: { id: t.mcpServerId } });
            if (server)
                mcpServerMap.set(t.mcpServerId, server);
        }
    }
    let toolCallCount = 0;
    let finalContent = '';
    for (let iter = 0; iter < maxIterations; iter++) {
        const result = await callStepfun({
            model,
            messages: workingMessages,
            tools: tools.length > 0 ? tools : undefined,
            onDelta: iter === maxIterations - 1 ? onDelta : undefined, // 仅最后一轮流式输出
            temperature: 0.7,
            maxTokens: 4096,
        });
        // 无 tool_calls，结束
        if (!result.toolCalls || result.toolCalls.length === 0) {
            finalContent = result.content;
            break;
        }
        // 有 tool_calls，记录 assistant 消息并执行
        toolCallCount += result.toolCalls.length;
        workingMessages.push({
            role: 'assistant',
            content: result.content || '',
            tool_calls: result.toolCalls,
        });
        for (const tc of result.toolCalls) {
            const toolName = tc.function.name;
            let toolResult = '未知工具';
            // 查找对应的 MCP 服务器
            const mcpPrefix = 'mcp_';
            if (toolName.startsWith(mcpPrefix)) {
                const serverName = toolName.slice(mcpPrefix.length);
                const server = [...mcpServerMap.values()].find((s) => sanitizeName(s.name) === serverName);
                if (server) {
                    let args = {};
                    let innerToolName = '';
                    try {
                        const parsed = JSON.parse(tc.function.arguments || '{}');
                        innerToolName = parsed.toolName || '';
                        args = parsed.args || {};
                    }
                    catch {
                        // ignore
                    }
                    toolResult = await executeMcpTool(server, innerToolName, args);
                }
                else {
                    toolResult = `未找到 MCP 服务器：${serverName}`;
                }
            }
            workingMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: toolResult,
            });
        }
        // 最后一轮强制取内容
        if (iter === maxIterations - 1) {
            finalContent = result.content;
        }
    }
    return { content: finalContent, toolCalls: toolCallCount, model };
}
//# sourceMappingURL=agentService.js.map