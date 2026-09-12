/**
 * 简单的进程内异步任务队列（MVP）。
 * 不依赖 Redis/BullMQ，适合轻量级异步任务（AI 摘要生成等）。
 * 后续如需分布式可平滑迁移到 BullMQ。
 */
const jobs = new Map();
function genId() {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * 提交异步任务。立即返回 jobId，任务在后台执行。
 * 失败不抛出主线程，仅记录在 job status 中。
 */
export function submitJob(type, handler) {
    const id = genId();
    const now = Date.now();
    jobs.set(id, { id, type, status: 'pending', createdAt: now, updatedAt: now });
    // 异步执行，不阻塞
    setImmediate(async () => {
        const job = jobs.get(id);
        if (!job)
            return;
        job.status = 'processing';
        job.updatedAt = Date.now();
        try {
            const result = await handler();
            job.status = 'done';
            job.result = result;
        }
        catch (e) {
            job.status = 'failed';
            job.error = e?.message || String(e);
        }
        job.updatedAt = Date.now();
        // 清理 5 分钟前完成的任务，避免内存泄漏
        setTimeout(() => {
            jobs.delete(id);
        }, 5 * 60 * 1000).unref?.();
    });
    return id;
}
export function getJobStatus(id) {
    return jobs.get(id);
}
//# sourceMappingURL=queue.js.map