/**
 * Git 仓库管理路由（先建仓库后上传 · 拆分存储 · 任务队列）。
 *
 * 流程：
 *   1. POST /api/git-repos                 创建仓库（仅建 GitRepo + bare repo，无内容）
 *   2. POST /api/git-repos/:id/upload       上传压缩包 → 入队 ZIP_UPLOAD 任务
 *      任务管线：解压 → 统计对话数 → 按轮次拆分 → 推送至 git 仓库（拆分存储）
 *   3. GET  /api/git-repos                   列出我的仓库
 *   4. GET  /api/git-repos/:id               仓库详情 + 对话列表
 *   5. GET  /api/tasks                       我的任务列表（通知栏用）
 *   6. GET  /api/tasks/active-count          活跃任务数（小红点）
 *   7. GET  /api/tasks/:id                   单任务状态
 */
import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/async.js'
import { verifyJwt, type AuthedRequest } from '../middleware/auth.js'
import {
  submitPersistentJob,
  registerTaskHandler,
  listUserTasks,
  getTask,
  countActiveTasks,
  type TaskContext,
} from '../services/persistentQueue.js'
import {
  extractConversationsFromZip,
  buildRepoFileTree,
} from '../services/conversationSplitter.js'
import { pushSplitTree, listRepoTree } from '../services/gitPusher.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
})
router.use(verifyJwt)

// ═══════════ ZIP_UPLOAD 任务处理器（注册一次） ═══════════

let handlerRegistered = false
function ensureTaskHandler(): void {
  if (handlerRegistered) return
  handlerRegistered = true

  registerTaskHandler('ZIP_UPLOAD', async (ctx: TaskContext) => {
    const { zipBuffer, repoFsName, repoName, gitUsername } = ctx.payload as {
      zipBuffer: string // base64
      repoFsName: string
      repoName: string
      gitUsername: string
    }
    const buf = Buffer.from(zipBuffer, 'base64')

    // 步骤 1：解压压缩包
    await ctx.update(5, '正在解压压缩包…', { current: 1, total: 4 })
    const extracted = extractConversationsFromZip(buf)

    // 步骤 2：统计对话数量
    const convCount = extracted.conversations.length
    const totalTurns = extracted.conversations.reduce((s, c) => s + c.turnCount, 0)
    await ctx.update(25, `解压完成：检测到 ${convCount} 个对话 / ${totalTurns} 轮`, {
      current: 2,
      total: 4,
    })

    // 步骤 3：拆分对话 → 构建文件树
    await ctx.update(45, '正在拆分对话（按轮次存储）…', { current: 3, total: 4 })
    const tree = buildRepoFileTree(repoName, extracted.conversations)

    // 步骤 4：推送至 git 仓库（拆分存储）
    await ctx.update(70, '正在推送至 Git 仓库…', { current: 4, total: 4 })
    const pushed = await pushSplitTree({
      repoFsName,
      gitUsername,
      commitMessage: `上传对话记录: ${convCount} 个对话 / ${totalTurns} 轮`,
      tree,
    })

    // 完成
    await ctx.update(100, `完成：已推送 ${pushed.pushedFiles} 个文件`, {
      current: 4,
      total: 4,
    })

    // 更新仓库状态
    await prisma.gitRepo.update({
      where: { id: ctx.gitRepoId! },
      data: {
        status: 'active',
        conversationCount: { increment: convCount },
        lastPushAt: new Date(),
      },
    })

    return {
      conversationCount: convCount,
      totalTurns,
      pushedFiles: pushed.pushedFiles,
      commit: pushed.commit,
    }
  })
}
ensureTaskHandler()

// ═══════════ 任务查询（通知栏用，必须放在 /:id 之前避免路由覆盖） ═══════════

// GET /api/git-repos/tasks  我的任务列表
router.get(
  '/tasks',
  asyncHandler(async (req: AuthedRequest, res) => {
    const tasks = await listUserTasks(req.user!.id, { limit: 30 })
    res.json({ tasks })
  }),
)

// GET /api/git-repos/tasks/active-count  活跃任务数（小红点）
router.get(
  '/tasks/active-count',
  asyncHandler(async (req: AuthedRequest, res) => {
    const count = await countActiveTasks(req.user!.id)
    res.json({ count })
  }),
)

// GET /api/git-repos/tasks/:id  单任务状态
router.get(
  '/tasks/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const taskId = Number(req.params.id)
    const task = await getTask(taskId, req.user!.id)
    if (!task) return res.status(404).json({ error: '任务不存在' })
    res.json({ task })
  }),
)

// ═══════════ 仓库 CRUD ═══════════

// POST /api/git-repos  创建仓库（先建仓库，之后再上传）
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { name, description } = req.body as { name?: string; description?: string }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请提供仓库名称' })
    }
    const gitUsername = (await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { gitUsername: true, username: true },
    }))!
    const author = gitUsername.gitUsername || gitUsername.username

    const repo = await prisma.gitRepo.create({
      data: {
        userId: req.user!.id,
        name: name.trim(),
        repoFsName: '', // 占位，创建后更新
        description: description?.trim() || null,
        status: 'empty',
      },
    })
    // 仓库文件名规则：u<uid>_r<repoId>.git
    const repoFsName = `u${req.user!.id}_r${repo.id}.git`
    await prisma.gitRepo.update({ where: { id: repo.id }, data: { repoFsName } })

    res.json({
      id: repo.id,
      name: repo.name,
      repoFsName,
      description: repo.description,
      status: 'empty',
      conversationCount: 0,
    })
  }),
)

// GET /api/git-repos  列出我的仓库
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const repos = await prisma.gitRepo.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({
      repos: repos.map((r) => ({
        id: r.id,
        name: r.name,
        repoFsName: r.repoFsName,
        description: r.description,
        status: r.status,
        conversationCount: r.conversationCount,
        lastPushAt: r.lastPushAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    })
  }),
)

// GET /api/git-repos/:id  仓库详情 + 对话列表（从拆分存储读取）
router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const repoId = Number(req.params.id)
    const repo = await prisma.gitRepo.findFirst({
      where: { id: repoId, userId: req.user!.id },
    })
    if (!repo) return res.status(404).json({ error: '仓库不存在' })

    // 从 git 仓库读取拆分文件树
    let conversations: Array<{ convId: string; title: string; turnCount: number; turns: number }> = []
    try {
      const tree = await listRepoTree(repo.repoFsName)
      const convDirs = new Set<string>()
      for (const p of Object.keys(tree)) {
        const m = /^conversations\/([^/]+)\//.exec(p)
        if (m) convDirs.add(m[1])
      }
      for (const dir of convDirs) {
        const meta = tree[`conversations/${dir}/meta.json`]
        if (!meta) continue
        const metaObj = JSON.parse(meta)
        const turnFiles = Object.keys(tree).filter(
          (p) => p.startsWith(`conversations/${dir}/turns/`) && p.endsWith('.json'),
        )
        conversations.push({
          convId: dir,
          title: metaObj.title || dir,
          turnCount: metaObj.turnCount ?? turnFiles.length,
          turns: turnFiles.length,
        })
      }
    } catch {
      /* 空仓库或读取失败 → conversations 为空 */
    }

    res.json({
      id: repo.id,
      name: repo.name,
      repoFsName: repo.repoFsName,
      description: repo.description,
      status: repo.status,
      conversationCount: repo.conversationCount,
      lastPushAt: repo.lastPushAt,
      createdAt: repo.createdAt,
      conversations,
    })
  }),
)

// POST /api/git-repos/:id/upload  上传压缩包 → 入队任务
router.post(
  '/:id/upload',
  upload.single('file'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const repoId = Number(req.params.id)
    const repo = await prisma.gitRepo.findFirst({
      where: { id: repoId, userId: req.user!.id },
    })
    if (!repo) return res.status(404).json({ error: '仓库不存在' })

    if (!req.file) return res.status(400).json({ error: '请上传压缩包文件' })

    const user = (await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { gitUsername: true, username: true },
    }))!
    const gitUsername = user.gitUsername || user.username

    // 把 zip buffer 转 base64 存入 payload（断电可续传）
    const task = await submitPersistentJob(
      req.user!.id,
      'ZIP_UPLOAD',
      {
        zipBuffer: req.file.buffer.toString('base64'),
        repoFsName: repo.repoFsName,
        repoName: repo.name,
        gitUsername,
      },
      {
        gitRepoId: repo.id,
        message: `等待上传至仓库「${repo.name}」`,
      },
    )

    res.json({
      taskId: task.id,
      status: task.status,
      repoId: repo.id,
      message: '任务已入队，正在等待执行',
    })
  }),
)

export default router
