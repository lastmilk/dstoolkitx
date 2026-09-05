/**
 * Web 端 Git 客户端（isomorphic-git + lightning-fs，浏览器内完成 fetch/commit/push）
 *
 * 仓库格式（服务端 pre-receive 白名单校验，仅接受以下两个路径）：
 *   container.json               { name: string, deepseekUserId: string }
 *   conversations/<convId>.json  { deepseekConvId, title, inserted_at, updated_at, mapping | messages }
 *
 * 同步模型（文件级三方合并：本地数据源 / 基线 commit / 远端 HEAD）：
 *   - 本地 == 基线，远端有变化   → 采用远端（本地模式回写 IndexedDB）
 *   - 远端 == 基线，本地有变化   → 推送本地变更
 *   - 双方都有变化且内容不同     → 冲突，交由 GitConflictDialog 三选一（本地/远端/智能合并）
 *   - 基线 = 上次成功同步后的远端 HEAD（localStorage 记账）；首次同步视远端为基线（本地优先）
 *
 * 智能合并（对话 JSON）：
 *   - mapping 格式 → 按节点 id 并集（双方节点都保留，保持树结构合法）
 *   - messages 数组 → 按 nodeId 并集，按 insertedAt 排序
 */
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import LightningFS from '@isomorphic-git/lightning-fs'
import type { ParsedConversation, ParsedMessage } from '@/types'
import { getBaseCommit, setBaseCommit } from '@/utils/gitcred'
import { request, getSessionToken } from '@/utils/request'

// ══════════ FS（IndexedDB 持久化，多仓库共用一个实例） ══════════
let fsInstance: LightningFS | null = null
function fsp() {
  if (!fsInstance) fsInstance = new LightningFS('dstoolkit-git')
  return fsInstance.promises
}

const DECODER = new TextDecoder()
const GIT_AUTHOR_EMAIL_DOMAIN = 'git.dstoolkit.local'

export type ConflictResolution = 'local' | 'remote' | 'smart'

export interface GitConflict {
  /** 仓库内路径：conversations/<id>.json */
  path: string
  convId: string
  title: string
  localSummary: { turns: number; updatedAt: string }
  remoteSummary: { turns: number; updatedAt: string }
  /** null = 本地已删除该对话 */
  localContent: string | null
  /** null = 远端已删除该对话 */
  remoteContent: string | null
  baseContent: string | null
}

/** 冲突待处理时挂起的同步上下文（resolveConflicts 后继续推送） */
export interface GitSyncContext {
  repoId: string
  dir: string
  url: string
  auth: { username: string; password: string }
  gitUsername: string
  containerName: string
  configId: number
  deepseekUserId: string
  /** 本地模式 = 数据源是 IndexedDB，推送成功后把远端并入的对话回写 */
  localMode: boolean
  baseSha: string | null
  remoteSha: string | null
  /** 本地数据源构建的完整树 */
  localTree: Record<string, string>
  /** 远端树（首次同步且远端不存在时为 null） */
  remoteTree: Record<string, string> | null
  baseTree: Record<string, string> | null
  /** 非冲突部分的三方裁决结果（path → 内容，null = 删除） */
  staged: Record<string, string | null>
  conflicts: GitConflict[]
  commitMessage: string
}

export type SyncOutcome =
  | { status: 'up-to-date'; commit: string | null }
  | { status: 'pushed'; commit: string; pushed: number; pulled: number }
  | { status: 'conflicts'; ctx: GitSyncContext }

// ══════════ 对话 JSON 构建 ══════════

function toIso(v: string | number | Date | undefined | null): string {
  if (!v) return new Date().toISOString()
  return new Date(v).toISOString()
}

/** mapping 为空（云端 lite 详情）时用扁平 messages 数组格式（服务端同样支持） */
function convToJson(c: ParsedConversation): string {
  const body: Record<string, unknown> = {
    deepseekConvId: c.deepseekConvId,
    title: c.title,
    inserted_at: toIso(c.insertedAt),
    updated_at: toIso(c.updatedAt),
  }
  if (c.mapping && Object.keys(c.mapping).length > 0) {
    body.mapping = c.mapping
  } else {
    body.messages = (c.messages ?? []).map((m) => ({
      nodeId: m.nodeId,
      parentId: m.parentId,
      role: m.role,
      model: m.model,
      content: m.content,
      insertedAt: toIso(m.insertedAt),
    }))
  }
  return JSON.stringify(body)
}

function convSummary(json: Record<string, unknown>): { turns: number; updatedAt: string } {
  const mapping = json.mapping as Record<string, unknown> | undefined
  const messages = json.messages as ParsedMessage[] | undefined
  let turns = 0
  if (mapping && typeof mapping === 'object') {
    turns = Object.values(mapping).filter(
      (n) => (n as { message?: { fragments?: unknown[] } })?.message?.fragments?.[0]
        && (n as { parent?: unknown }).parent !== null
        && ((n as { message?: { fragments?: Array<{ type?: string }> } }).message?.fragments?.[0]?.type === 'REQUEST'),
    ).length
  } else if (Array.isArray(messages)) {
    turns = messages.filter((m) => m.role === 'USER').length
  }
  return { turns, updatedAt: String(json.updated_at ?? '') }
}

/** mapping 并集：双方节点都保留（nodeId 为键，树天然去重） */
function mergeMappings(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const [id, node] of Object.entries(b)) {
    if (!(id in out)) out[id] = node
  }
  return out
}

/** messages 并集：按 nodeId 去重后按时间排序 */
function mergeMessages(a: ParsedMessage[], b: ParsedMessage[]): ParsedMessage[] {
  const byId = new Map<string, ParsedMessage>()
  for (const m of a) byId.set(m.nodeId, m)
  for (const m of b) if (!byId.has(m.nodeId)) byId.set(m.nodeId, m)
  return Array.from(byId.values()).sort((x, y) =>
    String(x.insertedAt).localeCompare(String(y.insertedAt)),
  )
}

/** 智能合并对话 JSON；结构不可合并时返回 null */
export function smartMergeConversation(
  baseJson: string | null,
  localJson: string | null,
  remoteJson: string | null,
): string | null {
  if (localJson == null || remoteJson == null) return null
  try {
    const base = baseJson ? JSON.parse(baseJson) : {}
    const local = JSON.parse(localJson)
    const remote = JSON.parse(remoteJson)
    if (local.mapping && remote.mapping) {
      const merged: Record<string, unknown> = {
        ...remote,
        mapping: mergeMappings(
          { ...(base.mapping ?? {}), ...local.mapping },
          remote.mapping,
        ),
      }
      if (String(local.updated_at ?? '') >= String(remote.updated_at ?? '')) merged.updated_at = local.updated_at
      return JSON.stringify(merged)
    }
    if (Array.isArray(local.messages) && Array.isArray(remote.messages)) {
      const merged = {
        ...remote,
        messages: mergeMessages(
          [...((base.messages as ParsedMessage[]) ?? []), ...local.messages],
          remote.messages,
        ),
      }
      if (String(local.updated_at ?? '') >= String(remote.updated_at ?? '')) merged.updated_at = local.updated_at
      return JSON.stringify(merged)
    }
    // 一方 mapping 一方 messages：无法安全合并
    return null
  } catch {
    return null
  }
}

// ══════════ 仓库基础操作 ══════════

export function repoIdFromUrl(repoUrl: string): string {
  return repoUrl.replace(/^.*\//, '').replace(/\.git$/, '')
}

async function readCommitTree(dir: string, sha: string): Promise<Record<string, string>> {
  const fs = fsp()
  const paths = await git.listFiles({ fs, dir, ref: sha })
  const out: Record<string, string> = {}
  for (const p of paths) {
    const blob = await git.readBlob({ fs, dir, oid: sha, filepath: p })
    out[p] = DECODER.decode(blob.blob)
  }
  return out
}

/** Basic 认证头（预发式：isomorphic-git 的 onAuth 是收到 401 挑战才补凭证，
 *  首个请求裸奔会触发服务端 WWW-Authenticate → 浏览器弹原生认证框，必须带 header 直发） */
function basicAuthHeader(auth: { username: string; password: string }): string {
  const bytes = new TextEncoder().encode(`${auth.username}:${auth.password}`)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `Basic ${btoa(bin)}`
}

async function resolveRemoteHead(dir: string, url: string, auth: { username: string; password: string }): Promise<string | null> {
  const fs = fsp()
  try {
    await git.fetch({ fs, http, dir, url, headers: { Authorization: basicAuthHeader(auth) }, onAuth: () => auth })
  } catch (e) {
    // 仓库不存在（服务端 404）→ 视为远端为空
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || (e as Error)?.message?.includes('404')) return null
    if (e instanceof git.Errors.NotFoundError) return null
    throw e
  }
  for (const ref of ['refs/remotes/origin/main', 'FETCH_HEAD', 'refs/remotes/origin/master']) {
    try {
      return await git.resolveRef({ fs, dir, ref })
    } catch { /* 尝试下一个 */ }
  }
  return null
}

/** 本地仓库就绪：已初始化则返回现有 HEAD；否则 init。远端存在时把 HEAD/索引/工作区对齐远端 */
async function ensureRepoReady(
  dir: string,
  url: string,
  auth: { username: string; password: string },
): Promise<{ localHead: string | null; remoteSha: string | null }> {
  const fs = fsp()
  let localHead: string | null = null
  try {
    localHead = await git.resolveRef({ fs, dir, ref: 'HEAD' })
  } catch {
    try {
      await git.init({ fs, dir, defaultBranch: 'main' })
    } catch (e) {
      // 已 init 过但尚无提交（unborn HEAD）也会走到这里，容忍 EEXIST
      if (!isEexist(e)) throw e
    }
  }
  const remoteSha = await resolveRemoteHead(dir, url, auth)
  // 补齐 remote 配置（幂等）：否则第二次同步的 fetch 找不到 refspec
  // （首次推送前 fetch 404 早退不触发，推送成功后才暴露）
  await git.setConfig({ fs, dir, path: 'remote.origin.url', value: url })
  await git.setConfig({ fs, dir, path: 'remote.origin.fetch', value: '+refs/heads/*:refs/remotes/origin/*' })
  await git.setConfig({ fs, dir, path: 'branch.main.remote', value: 'origin' })
  await git.setConfig({ fs, dir, path: 'branch.main.merge', value: 'refs/heads/main' })
  if (localHead == null && remoteSha) {
    // 本地仓库是全新的但远端已有内容：对齐远端（否则单文件 commit 会把远端其他文件删掉）
    await git.writeRef({ fs, dir, ref: 'refs/heads/main', value: remoteSha, force: true })
    await git.checkout({ fs, dir, ref: 'main', force: true })
    localHead = remoteSha
  }
  return { localHead, remoteSha }
}

function isEexist(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  return code === 'EEXIST' || /EEXIST|file already exists/i.test(String((e as Error)?.message ?? ''))
}

async function commitAndPush(
  ctx: Pick<GitSyncContext, 'dir' | 'url' | 'auth' | 'gitUsername' | 'commitMessage' | 'staged'>,
): Promise<{ commit: string }> {
  const fs = fsp()
  for (const [p, content] of Object.entries(ctx.staged)) {
    if (content === null) {
      try {
        await git.remove({ fs, dir: ctx.dir, filepath: p })
      } catch { /* 文件本就不在索引中 */ }
      continue
    }
    const full = `${ctx.dir}/${p}`
    const segs = p.split('/')
    if (segs.length > 1) {
      try {
        await fs.mkdir(`${ctx.dir}/${segs.slice(0, -1).join('/')}`)
      } catch (e) {
        if (!isEexist(e)) throw e
      }
    }
    await fs.writeFile(full, content)
    await git.add({ fs, dir: ctx.dir, filepath: p })
  }
  const sha = await git.commit({
    fs,
    dir: ctx.dir,
    message: ctx.commitMessage,
    author: { name: ctx.gitUsername, email: `${ctx.gitUsername}@${GIT_AUTHOR_EMAIL_DOMAIN}` },
  })
  await git.push({ fs, http, dir: ctx.dir, url: ctx.url, headers: { Authorization: basicAuthHeader(ctx.auth) }, onAuth: () => ctx.auth, ref: 'main' })
  return { commit: sha }
}

function isNonFastForward(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? '')
  return /fetch first|not a fast|fast-forward|PushRejected/i.test(msg)
}

// ══════════ 三方分类 ══════════

function classifyThreeWay(
  localTree: Record<string, string>,
  baseTree: Record<string, string> | null,
  remoteTree: Record<string, string> | null,
): { staged: Record<string, string | null>; conflicts: GitConflict[]; pushed: number; pulled: number } {
  const staged: Record<string, string | null> = {}
  const conflicts: GitConflict[] = []
  let pushed = 0
  let pulled = 0
  const paths = new Set([
    ...Object.keys(localTree),
    ...Object.keys(baseTree ?? {}),
    ...Object.keys(remoteTree ?? {}),
  ])
  for (const p of paths) {
    const local = localTree[p] ?? null
    const base = baseTree?.[p] ?? null
    const remote = remoteTree?.[p] ?? null
    if (local === remote) continue // 双方一致
    if (local === base) {
      // 本地无变化 → 采用远端
      staged[p] = remote
      if (remote !== null) pulled++
      continue
    }
    if (remote === base) {
      // 远端无变化 → 推送本地（null = 本地已删除）
      staged[p] = local
      pushed++
      continue
    }
    // 双方都变了且不同 → 冲突（仅对话文件；container.json 罕见，也走冲突）
    const m = /^conversations\/(.+)\.json$/.exec(p)
    let localJson: Record<string, unknown> = {}
    let remoteJson: Record<string, unknown> = {}
    try { localJson = JSON.parse(local ?? '') } catch { /* 本地已删除或解析失败 */ }
    try { remoteJson = JSON.parse(remote ?? '') } catch { /* 远端已删除或解析失败 */ }
    conflicts.push({
      path: p,
      convId: m ? (m[1] ?? p) : p,
      title: String(localJson.title ?? remoteJson.title ?? p),
      localSummary: convSummary(localJson),
      remoteSummary: convSummary(remoteJson),
      localContent: local,
      remoteContent: remote,
      baseContent: base,
    })
  }
  return { staged, conflicts, pushed, pulled }
}

// ══════════ 全量容器同步 ══════════

export interface SyncContainerOptions {
  configId: number
  containerName: string
  deepseekUserId: string
  repoUrl: string
  conversations: ParsedConversation[]
  localMode: boolean
  gitUsername: string
  apiKey: string
  commitMessage?: string
}

/**
 * 全量同步对话容器：把本地数据源（IndexedDB 或云端 DB 加载结果）构建成仓库树，
 * 与远端做三方合并后推送。存在冲突时返回 conflicts + 上下文，由 UI 弹窗收集裁决后
 * 调 resolveConflicts 完成推送。
 */
export async function syncContainer(o: SyncContainerOptions): Promise<SyncOutcome> {
  const repoId = repoIdFromUrl(o.repoUrl)
  const dir = `/repos/${repoId}`
  const auth = { username: o.gitUsername, password: o.apiKey }
  const { remoteSha } = await ensureRepoReady(dir, `${location.origin}${o.repoUrl}`, auth)
  const baseSha = getBaseCommit(repoId)

  const localTree: Record<string, string> = {
    'container.json': JSON.stringify({ name: o.containerName, deepseekUserId: o.deepseekUserId }),
  }
  for (const c of o.conversations) {
    localTree[`conversations/${c.deepseekConvId}.json`] = convToJson(c)
  }

  const remoteTree = remoteSha ? await readCommitTree(dir, remoteSha) : null
  // 基线：有记账用记账；无记账（本客户端首次同步）视远端为基线（本地优先，不产生冲突）
  let baseTree: Record<string, string> | null = null
  if (baseSha && baseSha !== remoteSha) {
    try {
      baseTree = await readCommitTree(dir, baseSha)
    } catch { baseTree = remoteTree }
  } else {
    baseTree = remoteTree
  }

  const { staged, conflicts } = classifyThreeWay(localTree, baseTree, remoteTree)
  if (Object.keys(staged).length === 0 && conflicts.length === 0) {
    return { status: 'up-to-date', commit: remoteSha }
  }
  const ctx: GitSyncContext = {
    repoId,
    dir,
    url: `${location.origin}${o.repoUrl}`,
    auth,
    gitUsername: o.gitUsername,
    containerName: o.containerName,
    configId: o.configId,
    deepseekUserId: o.deepseekUserId,
    localMode: o.localMode,
    baseSha,
    remoteSha,
    localTree,
    remoteTree,
    baseTree,
    staged,
    conflicts,
    commitMessage: o.commitMessage ?? `同步对话容器: ${o.containerName}`,
  }
  if (conflicts.length > 0) return { status: 'conflicts', ctx }
  return finishSync(ctx, {})
}

// ══════════ 单个对话增量同步 ══════════

export interface SyncSingleOptions {
  configId: number
  containerName: string
  deepseekUserId: string
  repoUrl: string
  conversation: ParsedConversation
  localMode: boolean
  gitUsername: string
  apiKey: string
}

/**
 * 增量同步单个对话：只改动 conversations/<id>.json 一个文件（远端仓库缺失时
 * 以 container.json + 该对话初始化仓库）。远端同文件已变化时走冲突流程。
 */
export async function syncSingleConversation(o: SyncSingleOptions): Promise<SyncOutcome> {
  const repoId = repoIdFromUrl(o.repoUrl)
  const dir = `/repos/${repoId}`
  const path = `conversations/${o.conversation.deepseekConvId}.json`
  const localContent = convToJson(o.conversation)
  const auth = { username: o.gitUsername, password: o.apiKey }
  const { remoteSha } = await ensureRepoReady(dir, `${location.origin}${o.repoUrl}`, auth)

  const staged: Record<string, string | null> = {}
  const conflicts: GitConflict[] = []
  let remoteTree: Record<string, string> | null = null

  if (!remoteSha) {
    // 远端仓库不存在 → 初始化仓库（仅含容器元信息 + 该对话）
    staged['container.json'] = JSON.stringify({ name: o.containerName, deepseekUserId: o.deepseekUserId })
    staged[path] = localContent
  } else {
    remoteTree = await readCommitTree(dir, remoteSha)
    const remoteContent = remoteTree[path] ?? null
    if (remoteContent === localContent) {
      return { status: 'up-to-date', commit: remoteSha }
    }
    const baseSha = getBaseCommit(repoId)
    let baseContent: string | null = null
    if (baseSha) {
      try {
        const raw = await git.readBlob({ fs: fsp(), dir, oid: baseSha, filepath: path })
        baseContent = DECODER.decode(raw.blob)
      } catch { baseContent = null }
    }
    if (!baseSha || baseContent === remoteContent || remoteContent === null) {
      // 远端自基线以来未动过该文件 → 直接增量推送本地版本
      staged[path] = localContent
      if (!remoteTree['container.json']) {
        staged['container.json'] = JSON.stringify({ name: o.containerName, deepseekUserId: o.deepseekUserId })
      }
    } else {
      const m = /^conversations\/(.+)\.json$/.exec(path)!
      const localJson = JSON.parse(localContent) as Record<string, unknown>
      const remoteJson = JSON.parse(remoteContent) as Record<string, unknown>
      conflicts.push({
        path,
        convId: m[1] ?? path,
        title: o.conversation.title,
        localSummary: convSummary(localJson),
        remoteSummary: convSummary(remoteJson),
        localContent,
        remoteContent,
        baseContent,
      })
    }
  }

  const ctx: GitSyncContext = {
    repoId,
    dir,
    url: `${location.origin}${o.repoUrl}`,
    auth,
    gitUsername: o.gitUsername,
    containerName: o.containerName,
    configId: o.configId,
    deepseekUserId: o.deepseekUserId,
    localMode: o.localMode,
    baseSha: getBaseCommit(repoId),
    remoteSha,
    localTree: { [path]: localContent },
    remoteTree,
    baseTree: null,
    staged,
    conflicts,
    commitMessage: `增量同步: ${o.conversation.title}`,
  }
  if (conflicts.length > 0) return { status: 'conflicts', ctx }
  return finishSync(ctx, {})
}

// ══════════ 冲突裁决后完成推送 ══════════

export async function resolveConflicts(
  ctx: GitSyncContext,
  resolutions: Record<string, ConflictResolution>,
): Promise<SyncOutcome> {
  return finishSync(ctx, resolutions)
}

// ══════════ 收尾：应用裁决 → commit → push（非快进自动重试一轮） ══════════

async function finishSync(
  ctx: GitSyncContext,
  resolutions: Record<string, ConflictResolution>,
): Promise<SyncOutcome> {
  const staged: Record<string, string | null> = { ...ctx.staged }
  const pullBack: Record<string, string> = {} // 远端并入/合并出的对话内容（本地模式回写 IndexedDB）

  // 1. 冲突裁决
  for (const c of ctx.conflicts) {
    const r = resolutions[c.path] ?? 'local'
    if (r === 'local') {
      staged[c.path] = ctx.localTree[c.path] ?? c.localContent
    } else if (r === 'remote') {
      staged[c.path] = c.remoteContent
      if (c.remoteContent !== null) pullBack[c.path] = c.remoteContent
    } else {
      const merged = smartMergeConversation(c.baseContent, c.localContent, c.remoteContent)
      if (merged === null) {
        // 智能合并不适用（格式不一致）→ 退化为本地优先
        staged[c.path] = ctx.localTree[c.path] ?? c.localContent
      } else {
        staged[c.path] = merged
        pullBack[c.path] = merged
      }
    }
  }
  // 2. 非冲突的"采用远端"项同样计入回写
  for (const [p, content] of Object.entries(staged)) {
    if (content !== null && ctx.localTree[p] !== content && !pullBack[p]) {
      pullBack[p] = content
    }
  }

  // 3. commit + push（非快进被拒 → 重跑一轮分类，最多 2 次）
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { commit } = await commitAndPush({ ...ctx, staged })
      setBaseCommit(ctx.repoId, commit)
      // 4. 本地模式：远端并入的对话回写 IndexedDB
      let pulled = 0
      if (ctx.localMode && Object.keys(pullBack).length > 0) {
        const { saveLocalConfig } = await import('@/utils/db')
        const convs: ParsedConversation[] = []
        for (const [p, content] of Object.entries(pullBack)) {
          const m = /^conversations\/(.+)\.json$/.exec(p)
          if (!m) continue
          try {
            const json = JSON.parse(content) as Record<string, unknown>
            const mapping = json.mapping as Record<string, unknown> | undefined
            const messages = (json.messages as ParsedMessage[] | undefined) ?? []
            convs.push({
              deepseekConvId: String(json.deepseekConvId ?? m[1]),
              title: String(json.title ?? '(无标题)'),
              insertedAt: String(json.inserted_at ?? ''),
              updatedAt: String(json.updated_at ?? ''),
              mapping: mapping ?? {},
              messages,
              turns: [],
              turnCount: messages.filter((x) => x.role === 'USER').length,
            })
            pulled++
          } catch { /* 跳过坏文件 */ }
        }
        if (convs.length > 0) {
          await saveLocalConfig(
            { id: null, name: ctx.containerName, deepseekUserId: ctx.deepseekUserId },
            convs,
          )
        }
      }
      return {
        status: 'pushed',
        commit,
        pushed: Object.keys(staged).filter((p) => !p.startsWith('container.json')).length - pulled,
        pulled,
      }
    } catch (e) {
      lastError = e
      if (isNonFastForward(e)) {
        // 远端在我们 fetch 之后又有新推送 → 重新对齐再试
        const fresh = await resolveRemoteHead(ctx.dir, ctx.url, ctx.auth)
        const remoteTree = fresh ? await readCommitTree(ctx.dir, fresh) : null
        const { staged: reStaged, conflicts: reConflicts } = classifyThreeWay(
          ctx.localTree,
          remoteTree, // 以新远端为基线：本地仍优先，避免递归冲突流程
          remoteTree,
        )
        if (reConflicts.length > 0) break
        Object.assign(staged, reStaged)
        continue
      }
      throw e
    }
  }
  throw lastError ?? new Error('Git 同步失败')
}

// ══════════ 同步准备：git-info + 登录态（免 GitUsername / dstkg_ APIKey） ══════════

export interface GitReadyInfo {
  repoUrl: string
  repoId: string
  containerName: string
  deepseekUserId: string
  localMode: boolean
  /** commit 作者名（仅展示用） */
  gitUsername: string
  /** Basic 密码 = 登录态 JWT（服务端识别会话凭证，内置同步无需 dstkg_ APIKey） */
  apiKey: string
}

/**
 * Git 推送前的准备流程（Configs / Explore 共用）：
 *  1. GET /configs/:id/git-info 拿仓库地址
 *  2. 直接复用当前登录态 JWT 作为 Basic 密码 —— 服务端内置客户端通道
 *     校验会话凭证并核对仓库归属，无需 GitUsername / dstkg_ APIKey
 *    （dstkg_ APIKey 仅第三方 Git 客户端接入时才需要）
 */
export async function prepareGitSync(configId: number): Promise<GitReadyInfo> {
  const token = getSessionToken()
  if (!token) throw new Error('登录已过期，请重新登录后再同步')

  const info = (await request.get(`/configs/${configId}/git-info`)) as {
    repoUrl: string
    gitUsername: string | null
  }

  const repoId = repoIdFromUrl(info.repoUrl)
  const cfgRes = (await request.get('/configs')) as { configs?: Array<{ id: number; name: string; deepseekUserId: string }> }
  const container = (cfgRes.configs ?? []).find((c) => c.id === configId)

  return {
    repoUrl: info.repoUrl,
    repoId,
    containerName: container?.name ?? repoId,
    deepseekUserId: container?.deepseekUserId ?? '',
    localMode: false,
    gitUsername: info.gitUsername ?? 'dstoolkit',
    apiKey: token,
  }
}
