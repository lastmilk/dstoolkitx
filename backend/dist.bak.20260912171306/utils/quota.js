import { prisma } from './prisma.js';
export const TIER_LIMITS = {
    FREE: {
        maxMb: 50 * 1024 * 1024,
        maxTurns: 200,
        apiRatePerMin: 0,
        canShare: false,
        canCustomSlug: false,
        maxFolders: 10,
        monthlyAiCredits: 0,
    },
    PRO: {
        maxMb: 100 * 1024 * 1024,
        maxTurns: 2000,
        apiRatePerMin: 0,
        canShare: true,
        canCustomSlug: false,
        maxFolders: 50,
        monthlyAiCredits: 50,
    },
    PLUS: {
        maxMb: 500 * 1024 * 1024,
        maxTurns: -1,
        apiRatePerMin: 100,
        canShare: true,
        canCustomSlug: true,
        maxFolders: -1,
        monthlyAiCredits: 500,
    },
    ULTIMATE: {
        maxMb: 2 * 1024 * 1024 * 1024,
        maxTurns: -1,
        apiRatePerMin: 500,
        canShare: true,
        canCustomSlug: true,
        maxFolders: -1,
        monthlyAiCredits: 2000,
    },
    TEAM: {
        maxMb: 10 * 1024 * 1024 * 1024,
        maxTurns: -1,
        apiRatePerMin: 500,
        canShare: true,
        canCustomSlug: true,
        maxFolders: -1,
        monthlyAiCredits: 1000, // per seat
    },
};
/** 等级权重，用于判断升级方向 */
export const TIER_RANK = {
    FREE: 0,
    PRO: 1,
    PLUS: 2,
    ULTIMATE: 3,
    TEAM: 4,
};
/**
 * 统计用户已用存储与轮次。
 * rawMapping 是 Conversation 的 JSON 字段；content 是 Message 的 LongText。
 * 用 MySQL LENGTH() 求字节，避免全量回传到 Node。
 */
export async function getUserUsage(userId) {
    const [convRow] = (await prisma.$queryRaw `
    SELECT COALESCE(SUM(LENGTH(c.rawMapping)), 0) AS bytes,
           COALESCE(SUM(c.turnCount), 0) AS turns
    FROM Conversation c
    JOIN DeepseekConfig dc ON dc.id = c.configId
    WHERE dc.userId = ${userId}
  `);
    const [msgRow] = (await prisma.$queryRaw `
    SELECT COALESCE(SUM(LENGTH(m.content)), 0) AS bytes
    FROM Message m
    JOIN Conversation c ON c.id = m.conversationId
    JOIN DeepseekConfig dc ON dc.id = c.configId
    WHERE dc.userId = ${userId}
  `);
    const convBytes = Number(convRow?.bytes ?? 0n);
    const msgBytes = Number(msgRow?.bytes ?? 0n);
    const turns = Number(convRow?.turns ?? 0n);
    return {
        usedBytes: convBytes + msgBytes,
        usedTurns: turns,
    };
}
/** 校验上传是否符合配额（轮次硬限 + MB 软限）。返回 ok 或拒绝原因。 */
export async function checkUploadQuota(userId, tier, incomingTurns, incomingBytes) {
    const limits = TIER_LIMITS[tier];
    const usage = await getUserUsage(userId);
    if (limits.maxTurns >= 0 && usage.usedTurns + incomingTurns > limits.maxTurns) {
        return {
            ok: false,
            reason: `已达轮次上限（${usage.usedTurns}/${limits.maxTurns}），本次需 +${incomingTurns} 轮`,
            upgradeHint: true,
        };
    }
    if (limits.maxMb >= 0 && usage.usedBytes + incomingBytes > limits.maxMb) {
        const usedMb = (usage.usedBytes / 1024 / 1024).toFixed(1);
        const limitMb = (limits.maxMb / 1024 / 1024).toFixed(0);
        return {
            ok: false,
            reason: `已达存储上限（${usedMb}MB/${limitMb}MB），本次需 +${(incomingBytes / 1024 / 1024).toFixed(1)}MB`,
            upgradeHint: true,
        };
    }
    return { ok: true };
}
// ═══════════ AI 积分系统（MKT-M1 / MKT-M4） ═══════════
/** AI 增值操作消耗积分价目表 */
export const AI_CREDIT_COSTS = {
    SUMMARY: 10, // AI 对话摘要
    SUMMARY_BATCH: 50, // 批量摘要 10 段
    KNOWLEDGE_CARD: 15, // 知识卡片提取
    AI_ORGANIZE: 30, // AI 批量整理文件夹
    EXPORT_POLISH: 30, // AI 导出润色
    SEMANTIC_SEARCH: 0, // 语义搜索增强（小额可忽略）
};
/** 充值包价目表 */
export const CREDIT_PACKS = [
    { id: 'pack_500', credits: 500, price: 9.9, label: '500 积分' },
    { id: 'pack_2000', credits: 2000, price: 29, label: '2000 积分' },
    { id: 'pack_10000', credits: 10000, price: 99, label: '10000 积分' },
];
/**
 * 消耗 AI 积分。余额不足时抛错（前端提示购买充值包）。
 * 同步写 QuotaLedger 流水。
 */
export async function consumeCredits(userId, action, amount, detail) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiCredits: true },
    });
    if (user.aiCredits < amount) {
        throw new CreditInsufficientError(amount, user.aiCredits);
    }
    const newBalance = user.aiCredits - amount;
    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { aiCredits: newBalance },
        }),
        prisma.quotaLedger.create({
            data: {
                userId,
                action,
                delta: -amount,
                balance: newBalance,
                detail: detail || undefined,
            },
        }),
    ]);
    return newBalance;
}
/** 赠予 AI 积分（充值/邀请奖励/月度赠送） */
export async function grantCredits(userId, action, amount, detail) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiCredits: true },
    });
    const newBalance = user.aiCredits + amount;
    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { aiCredits: newBalance },
        }),
        prisma.quotaLedger.create({
            data: {
                userId,
                action,
                delta: amount,
                balance: newBalance,
                detail: detail || undefined,
            },
        }),
    ]);
    return newBalance;
}
/** 检查并消耗积分，返回 ok 或余额不足错误 */
export async function tryConsumeCredits(userId, action, amount, detail) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiCredits: true },
    });
    if (user.aiCredits < amount) {
        return { ok: false, needed: amount, balance: user.aiCredits };
    }
    const balance = await consumeCredits(userId, action, amount, detail);
    return { ok: true, balance };
}
export class CreditInsufficientError extends Error {
    needed;
    balance;
    constructor(needed, balance) {
        super(`AI 积分不足：需要 ${needed}，当前余额 ${balance}`);
        this.needed = needed;
        this.balance = balance;
        this.name = 'CreditInsufficientError';
        Object.setPrototypeOf(this, CreditInsufficientError.prototype);
    }
}
//# sourceMappingURL=quota.js.map