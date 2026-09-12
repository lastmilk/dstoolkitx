/**
 * Git 推送 → MySQL 镜像工作器。
 * post-receive 钩子把 "old new ref" 追加到 data/mirror-queue/<repo>.jsonl，
 * 本工作器（setInterval 轮询 + 推送完成后 kickMirror 即时触发）消费队列：
 *   git diff --name-status old new → A/M 文件取新内容入库，D 文件删行。
 * 全程幂等（upsert），失败保留队列待下轮重试。
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '../utils/prisma.js';
import { upsertConversations, repoConversationToParsed } from './conversationStore.js';
const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = process.env.GIT_REPO_ROOT || path.join(BACKEND_ROOT, 'data', 'git-repos');
const QUEUE_DIR = process.env.GIT_MIRROR_QUEUE || path.join(BACKEND_ROOT, 'data', 'mirror-queue');
function isZero(sha) {
    return /^0+$/.test(sha);
}
/** 解析 "u<uid>_c<cid>.git" */
function parseRepo(name) {
    const m = /^u(\d+)_c(\d+)\.git$/.exec(name);
    return m ? { userId: Number(m[1]), containerId: Number(m[2]) } : null;
}
async function git(repoPath, args) {
    const { stdout } = await execFileP('git', ['-C', repoPath, ...args], { maxBuffer: 256 * 1024 * 1024 });
    return stdout;
}
/** 处理单个仓库的队列文件，返回是否全部成功 */
async function processQueueFile(file) {
    // 队列文件名 u<uid>_c<cid>.jsonl → 仓库目录 u<uid>_c<cid>.git
    const repoName = `${file.replace(/\.jsonl$/, '')}.git`;
    const repoRef = parseRepo(repoName);
    if (!repoRef) {
        fs.rmSync(path.join(QUEUE_DIR, file), { force: true });
        return true;
    }
    const raw = fs.readFileSync(path.join(QUEUE_DIR, file), 'utf8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0)
        return true;
    const repoPath = path.join(REPO_ROOT, repoName);
    if (!fs.existsSync(path.join(repoPath, 'HEAD'))) {
        fs.rmSync(path.join(QUEUE_DIR, file), { force: true }); // 仓库已删，丢弃
        return true;
    }
    const container = await prisma.deepseekConfig.findFirst({
        where: { id: repoRef.containerId, userId: repoRef.userId },
    });
    if (!container) {
        fs.rmSync(path.join(QUEUE_DIR, file), { force: true });
        return true;
    }
    for (const line of lines) {
        const [oldRev, newRev, ref] = line.split(/\s+/);
        if (!ref || !ref.startsWith('refs/heads/'))
            continue;
        // 枚举变更文件：old 为零（新分支）→ 全量列出 new 树；否则 diff --name-status
        const changes = [];
        if (isZero(oldRev)) {
            const out = await git(repoPath, ['ls-tree', '-r', '--name-only', newRev]);
            for (const p of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
                changes.push({ status: 'A', path: p });
            }
        }
        else {
            const out = await git(repoPath, ['diff', '--name-status', oldRev, newRev]);
            for (const row of out.split('\n')) {
                const m = /^([AMD])\s+(.+)$/.exec(row.trim());
                if (m)
                    changes.push({ status: m[1], path: m[2] });
            }
        }
        for (const ch of changes) {
            if (ch.path === 'container.json') {
                if (ch.status === 'D')
                    continue;
                try {
                    const content = await git(repoPath, ['show', `${newRev}:${ch.path}`]);
                    const meta = JSON.parse(content);
                    const data = {};
                    if (typeof meta.name === 'string' && meta.name && meta.name !== container.name)
                        data.name = meta.name;
                    if (typeof meta.deepseekUserId === 'string' && meta.deepseekUserId && meta.deepseekUserId !== container.deepseekUserId) {
                        data.deepseekUserId = meta.deepseekUserId;
                    }
                    if (Object.keys(data).length > 0) {
                        await prisma.deepseekConfig.update({ where: { id: container.id }, data });
                    }
                }
                catch (e) {
                    console.warn(`[git-mirror] ${repoName} container.json 处理失败`, e?.message);
                }
                continue;
            }
            const m = /^conversations\/([^/]+)\.json$/.exec(ch.path);
            if (!m)
                continue;
            const convId = m[1];
            if (ch.status === 'D') {
                await prisma.conversation.deleteMany({ where: { configId: container.id, deepseekConvId: convId } });
                continue;
            }
            try {
                const content = await git(repoPath, ['show', `${newRev}:${ch.path}`]);
                const parsed = repoConversationToParsed(JSON.parse(content));
                if (!parsed) {
                    console.warn(`[git-mirror] ${repoName} ${ch.path} 跳过：schema 不符`);
                    continue;
                }
                await upsertConversations(repoRef.userId, container.id, [parsed]);
            }
            catch (e) {
                console.warn(`[git-mirror] ${repoName} ${ch.path} 镜像失败`, e?.message);
            }
        }
    }
    return true;
}
let running = false;
async function drainQueue() {
    if (running)
        return;
    running = true;
    try {
        const files = fs.existsSync(QUEUE_DIR) ? fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.jsonl')) : [];
        for (const file of files) {
            try {
                const ok = await processQueueFile(file);
                if (ok)
                    fs.rmSync(path.join(QUEUE_DIR, file), { force: true });
            }
            catch (e) {
                console.warn(`[git-mirror] 队列 ${file} 本轮未完成，下轮重试`, e?.message);
            }
        }
    }
    finally {
        running = false;
    }
}
/** 推送完成后即时触发一轮镜像 */
export function kickMirror(_repoRef) {
    setImmediate(() => drainQueue().catch(() => { }));
}
/** 常驻轮询（5s），进程启动时调用 */
export function startMirrorWorker() {
    setInterval(() => drainQueue().catch(() => { }), 5000).unref();
}
//# sourceMappingURL=gitMirror.js.map