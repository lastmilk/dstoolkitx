import { env } from '../config/env.js';
/**
 * 从 fetch ReadableStream 解析 SSE，逐段回调 onDelta。
 * 支持标准 OpenAI 兼容 SSE 格式（data: {...}\n\n）。
 */
async function consumeSse(body, onDelta) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let toolCalls;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 事件以 \n\n 分隔
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
            const lines = event.split('\n');
            for (const line of lines) {
                if (!line.startsWith('data:'))
                    continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]')
                    continue;
                try {
                    const json = JSON.parse(data);
                    const choice = json.choices?.[0];
                    const delta = choice?.delta;
                    if (delta?.content) {
                        fullContent += delta.content;
                        onDelta(delta.content);
                    }
                    if (delta?.tool_calls) {
                        if (!toolCalls)
                            toolCalls = [];
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? toolCalls.length;
                            if (!toolCalls[idx]) {
                                toolCalls[idx] = {
                                    id: tc.id || '',
                                    type: 'function',
                                    function: { name: tc.function?.name || '', arguments: '' },
                                };
                            }
                            if (tc.id)
                                toolCalls[idx].id = tc.id;
                            if (tc.function?.name)
                                toolCalls[idx].function.name = tc.function.name;
                            if (tc.function?.arguments)
                                toolCalls[idx].function.arguments += tc.function.arguments;
                        }
                    }
                }
                catch {
                    // 忽略非 JSON 行
                }
            }
        }
    }
    return { fullContent, toolCalls };
}
// ═══════════ DeepSeek 客户端 ═══════════
export const DEEPSEEK_MODELS = {
    chat: 'deepseek-chat',
    reasoner: 'deepseek-reasoner',
};
/**
 * 调用 DeepSeek Chat Completions（OpenAI 兼容）。
 * 传入 onDelta 时走 SSE 流式，否则走非流式。
 */
export async function callDeepseek(opts) {
    const key = env.deepseekServerKey;
    if (!key)
        throw new Error('服务端未配置 DEEPSEEK_SERVER_API_KEY');
    const body = {
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
    };
    if (opts.responseFormat)
        body.response_format = opts.responseFormat;
    if (opts.tools?.length)
        body.tools = opts.tools;
    if (opts.onDelta) {
        const res = await fetch(`${env.deepseekApiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({ ...body, stream: true }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`DeepSeek API 错误 (${res.status}): ${text || res.statusText}`);
        }
        if (!res.body)
            throw new Error('DeepSeek 返回空响应');
        const { fullContent, toolCalls } = await consumeSse(res.body, opts.onDelta);
        return { content: fullContent, toolCalls, model: opts.model };
    }
    const res = await fetch(`${env.deepseekApiBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`DeepSeek API 错误 (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json());
    const msg = data.choices?.[0]?.message;
    return {
        content: msg?.content || '',
        toolCalls: msg?.tool_calls,
        model: data.model || opts.model,
    };
}
// ═══════════ StepFun（阶跃星辰）客户端 ═══════════
export const STEPFUN_MODELS = {
    step1o: 'step-1o',
    step1oFlash: 'step-1o-flash',
    step1v: 'step-1v',
};
/**
 * 调用 StepFun Chat Completions（OpenAI 兼容）。
 */
export async function callStepfun(opts) {
    const key = env.stepfunServerKey;
    if (!key)
        throw new Error('服务端未配置 STEPFUN_SERVER_API_KEY');
    const body = {
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
    };
    if (opts.responseFormat)
        body.response_format = opts.responseFormat;
    if (opts.tools?.length)
        body.tools = opts.tools;
    if (opts.onDelta) {
        const res = await fetch(`${env.stepfunApiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({ ...body, stream: true }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`StepFun API 错误 (${res.status}): ${text || res.statusText}`);
        }
        if (!res.body)
            throw new Error('StepFun 返回空响应');
        const { fullContent, toolCalls } = await consumeSse(res.body, opts.onDelta);
        return { content: fullContent, toolCalls, model: opts.model };
    }
    const res = await fetch(`${env.stepfunApiBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`StepFun API 错误 (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json());
    const msg = data.choices?.[0]?.message;
    return {
        content: msg?.content || '',
        toolCalls: msg?.tool_calls,
        model: data.model || opts.model,
    };
}
//# sourceMappingURL=aiClient.js.map