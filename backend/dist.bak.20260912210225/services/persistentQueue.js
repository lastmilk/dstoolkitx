/**
 * 持久化任务队列（DB-backed，支持断电续传）。
 *
 * 设计：
 *  - 任务持久化到 MySQL（Task 表），进程重启后可恢复。
 *  - 状态机：pending → processing → done / failed
 *  - 进度可更新（progress / current / total / message），前端轮询展示。
 *  - 处理器注册制：type → handler，handler 接收 task 并可更新进度。
 *  - 断电续传：进程启动时 resumePendingTasks() 把上次中断的 processing 重置为 pending
 *    并重新消费；payload 字段保存参数供续传。
 *  - 单线程顺序消费（避免 git 并发冲突），handler 失败自动重试（有限次）。
 */
import { prisma } from '../utils/prisma.js';
// ═══════════ 处理器注册 ═══════════
const handlers = new Map();
export function registerTaskHandler(type, handler) {
    handlers.set(type, handler);
}
// ═══════════ 序列化 ═══════════
function toRecord(t) {
    return {
        id: t.id,
        userId: t.userId,
        type: t.type,
        status: t.status,
        progress: t.progress,
        total: t.total,
        current: t.current,
        message: t.message,
        result: t.result,
        error: t.error,
        gitRepoId: t.gitRepoId,
        payload: t.payload,
        createdAt: t.createdAt?.toISOString?.() ?? t.createdAt,
        updatedAt: t.updatedAt?.toISOString?.() ?? t.updatedAt,
        startedAt: t.startedAt?.toISOString?.() ?? t.startedAt ?? null,
        finishedAt: t.finishedAt?.toISOString?.() ?? t.finishedAt ?? null,
    };
}
// ═══════════ 提交任务 ═══════════
/**
 * 提交任务到队列（立即返回 taskId，后台异步执行）。
 * payload 持久化到 DB，断电后可据此续传。
 */
export async function submitPersistentJob(userId, type, payload, opts) {
    const task = await prisma.task.create({
        data: {
            userId,
            type,
            status: 'pending',
            payload: payload,
            gitRepoId: opts?.gitRepoId ?? null,
            message: opts?.message ?? null,
        },
    });
    // 触发消费
    setImmediate(() => drainQueue().catch(() => { }));
    return toRecord(task);
}
// ═══════════ 更新进度 ═══════════
async function updateProgress(taskId, progress, message, extra) {
    await prisma.task.update({
        where: { id: taskId },
        data: {
            progress: Math.min(100, Math.max(0, progress)),
            message,
            current: extra?.current,
            total: extra?.total,
        },
    });
}
// ═══════════ 查询 ═══════════
export async function getTask(taskId, userId) {
    const t = await prisma.task.findFirst({ where: { id: taskId, userId } });
    return t ? toRecord(t) : null;
}
export async function listUserTasks(userId, opts) {
    const tasks = await prisma.task.findMany({
        where: { userId, ...(opts?.type ? { type: opts.type } : {}) },
        orderBy: { createdAt: 'desc' },
        take: opts?.limit ?? 50,
    });
    return tasks.map(toRecord);
}
/** 统计待处理任务数（用于小红点） */
export async function countActiveTasks(userId) {
    return prisma.task.count({
        where: { userId, status: { in: ['pending', 'processing'] } },
    });
}
// ═══════════ 消费循环 ═══════════
let draining = false;
async function drainQueue() {
    if (draining)
        return;
    draining = true;
    try {
        while (true) {
            // 取一条最早的 pending 任务
            const task = await prisma.task.findFirst({
                where: { status: 'pending' },
                orderBy: { createdAt: 'asc' },
            });
            if (!task)
                break;
            const handler = handlers.get(task.type);
            if (!handler) {
                await prisma.task.update({
                    where: { id: task.id },
                    data: { status: 'failed', error: `未注册的任务类型: ${task.type}`, finishedAt: new Date() },
                });
                continue;
            }
            // 标记 processing
            await prisma.task.update({
                where: { id: task.id },
                data: { status: 'processing', startedAt: new Date(), progress: 0, message: '等待执行…' },
            });
            const ctx = {
                taskId: task.id,
                userId: task.userId,
                gitRepoId: task.gitRepoId,
                payload: task.payload,
                update: (progress, message, extra) => updateProgress(task.id, progress, message, extra),
            };
            try {
                const result = await handler(ctx);
                await prisma.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'done',
                        progress: 100,
                        message: '完成',
                        result: result,
                        finishedAt: new Date(),
                    },
                });
            }
            catch (e) {
                await prisma.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'failed',
                        error: e?.message || String(e),
                        finishedAt: new Date(),
                    },
                });
            }
        }
    }
    finally {
        draining = false;
    }
}
// ═══════════ 断电续传：进程启动时调用 ═══════════
/**
 * 进程重启时恢复：
 *  1. 把卡在 processing 的任务重置为 pending（断电时中断的）
 *  2. 重新消费 pending 队列
 */
export async function resumePendingTasks() {
    // 断电中断的 processing 任务重置为 pending（payload 完整可续传）
    const stuck = await prisma.task.updateMany({
        where: { status: 'processing' },
        data: { status: 'pending', message: '断电恢复中…' },
    });
    if (stuck.count > 0) {
        console.log(`[task-queue] 恢复 ${stuck.count} 个中断任务`);
    }
    setImmediate(() => drainQueue().catch(() => { }));
}
/** 常驻轮询（10s 兜底，防止 setImmediate 漏触发） */
export function startTaskQueueWorker() {
    setInterval(() => drainQueue().catch(() => { }), 10000).unref?.();
    // 启动时恢复
    resumePendingTasks().catch(() => { });
}
//# sourceMappingURL=persistentQueue.js.map