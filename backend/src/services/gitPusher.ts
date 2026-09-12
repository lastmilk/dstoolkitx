/**
 * 服务端 Git 推送器（拆分存储专用）。
 *
 * 上传流程的服务端环节：把拆分后的文件树写入临时工作仓库，
 * commit 后推送回 bare 仓库（u<uid>_r<repoId>.git）。
 *
 * 与 /git/* 智能HTTP服务复用同一套 bare 仓库目录（data/git-repos），
 * 但仓库命名规则不同：旧 = u<uid>_c<cid>.git（绑定 DeepseekConfig），
 * 新 = u<uid>_r<repoId>.git（绑定 GitRepo 表，先建后传）。
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import type { RepoFileTree } from './conversationSplitter.js'

const execFileP = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(__dirname, '..', '..')
const REPO_ROOT = process.env.GIT_REPO_ROOT || path.join(BACKEND_ROOT, 'data', 'git-repos')
const HOOKS_PATH = process.env.GIT_HOOKS_PATH || path.join(BACKEND_ROOT, 'git-hooks')

async function git(args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<string> {
  const { stdout } = await execFileP('git', args, { maxBuffer: 256 * 1024 * 1024, ...opts })
  return stdout
}

/** 确保 bare 仓库存在（不存在则 init），返回仓库路径 */
export async function ensureBareRepo(repoFsName: string): Promise<string> {
  const repoPath = path.join(REPO_ROOT, repoFsName)
  if (!fs.existsSync(path.join(repoPath, 'HEAD'))) {
    fs.mkdirSync(REPO_ROOT, { recursive: true })
    await git(['init', '--bare', '-b', 'main', repoPath])
    // 拆分存储仓库不套用 pre-receive 白名单（白名单只认 conversations/<id>.json 单文件）
    // 这里设独立 hooks 路径为空目录即可；如需校验可另写钩子
  }
  return repoPath
}

/**
 * 把拆分后的文件树推送到 bare 仓库。
 * - 克隆（或初始化）到临时工作目录
 * - 写入文件树
 * - commit + push origin main
 * - 清理临时目录
 */
export async function pushSplitTree(opts: {
  repoFsName: string
  gitUsername: string
  commitMessage: string
  tree: RepoFileTree
}): Promise<{ commit: string; pushedFiles: number }> {
  const { repoFsName, gitUsername, commitMessage, tree } = opts
  const barePath = await ensureBareRepo(repoFsName)
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `dstk-push-`))

  try {
    // 尝试 clone（仓库已有提交时）；失败则 init 空仓库
    let hasRemote = false
    try {
      await git(['clone', barePath, '.', '--quiet'], { cwd: workDir })
      hasRemote = true
    } catch {
      await git(['init', '-b', 'main', '.'], { cwd: workDir })
    }

    if (hasRemote) {
      // 拉取最新（确保基于远端 HEAD）
      try {
        await git(['pull', 'origin', 'main', '--quiet', '--allow-unrelated-histories', '--no-edit'], { cwd: workDir })
      } catch {
        /* 空仓库无远端 HEAD，忽略 */
      }
    }

    // 写入文件树
    let pushedFiles = 0
    for (const [relPath, content] of Object.entries(tree)) {
      const fullPath = path.join(workDir, relPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf8')
      pushedFiles++
    }

    // 暂存全部
    await git(['add', '-A'], { cwd: workDir })

    // 有变更才 commit（避免空提交）
    try {
      await git(['diff', '--cached', '--quiet'], { cwd: workDir })
      // 无差异 → up-to-date
      return { commit: '', pushedFiles: 0 }
    } catch {
      // 有暂存差异，继续 commit
    }

    // 服务进程（www）通常没有全局 git 身份配置，这里用 -c 显式提供提交者身份，
    // 避免 "Committer identity unknown" 导致提交失败；--author 仍记录为上传用户。
    await git(
      [
        '-c',
        `user.name=${gitUsername}`,
        '-c',
        `user.email=${gitUsername}@git.dstoolkit.local`,
        'commit',
        '-m',
        commitMessage,
        `--author=${gitUsername} <${gitUsername}@git.dstoolkit.local>`,
      ],
      { cwd: workDir },
    )

    // 设置 remote（clone 自带 origin，init 需手动加）
    if (!hasRemote) {
      await git(['remote', 'add', 'origin', barePath], { cwd: workDir })
    }

    // 推送（强制覆盖历史可能需要 --force-with-lease，这里首次推送用普通 push）
    await git(['push', 'origin', 'main', '--quiet'], { cwd: workDir })

    // 取 commit sha
    const sha = (await git(['rev-parse', 'HEAD'], { cwd: workDir })).trim()
    return { commit: sha, pushedFiles }
  } finally {
    // 清理临时目录
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

/** 列出仓库内所有文件（path → 内容） */
export async function listRepoTree(repoFsName: string): Promise<RepoFileTree> {
  const barePath = path.join(REPO_ROOT, repoFsName)
  if (!fs.existsSync(path.join(barePath, 'HEAD'))) {
    throw new Error('仓库不存在')
  }
  // 取 HEAD 树
  let headSha: string
  try {
    headSha = (await git(['-C', barePath, 'rev-parse', 'HEAD'])).trim()
  } catch {
    return {} // 空仓库
  }
  const out = await git(['-C', barePath, 'ls-tree', '-r', '--name-only', headSha])
  const files = out.split('\n').map((s) => s.trim()).filter(Boolean)
  const tree: RepoFileTree = {}
  for (const p of files) {
    try {
      const content = await git(['-C', barePath, 'show', `${headSha}:${p}`])
      tree[p] = content
    } catch {
      /* 跳过二进制 */
    }
  }
  return tree
}
