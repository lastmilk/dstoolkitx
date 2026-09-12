import { env } from '../config/env.js';
/**
 * 调用 kufaka 校验外部售出的卡密。
 * 接口契约（需 kufaka 提供/对接）：
 *   POST {KUFAKA_API_URL}/validate
 *   headers: { Authorization: Bearer {KUFAKA_API_KEY} }
 *   body: { code }
 *   返回：{ valid: boolean, tier: 'PRO'|'PLUS'|'ULTIMATE', duration: 'PERMANENT'|'ANNUAL' }
 *
 * 未配置 KUFAKA_API_URL / KEY 时直接返回 null（降级为纯本地卡密）。
 */
export async function validateKufakaCard(code) {
    if (!env.kufakaEnabled)
        return null;
    try {
        const res = await fetch(`${env.kufakaApiUrl.replace(/\/$/, '')}/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.kufakaApiKey}`,
            },
            body: JSON.stringify({ code }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            // kufaka 返回 4xx 表示卡密无效；5xx 不应作废卡密
            if (res.status >= 400 && res.status < 500)
                return { valid: false };
            return null;
        }
        const data = (await res.json());
        return data;
    }
    catch (e) {
        console.warn('[kufaka] 校验失败，降级为本地卡密校验:', e?.message);
        return null;
    }
}
/** 将 kufaka 返回的等级字符串映射为内部 Tier；未知则返回 null */
export function parseKufakaTier(s) {
    if (!s)
        return null;
    const up = String(s).toUpperCase();
    if (up === 'PRO' || up === 'PLUS' || up === 'ULTIMATE')
        return up;
    return null;
}
//# sourceMappingURL=kufaka.js.map