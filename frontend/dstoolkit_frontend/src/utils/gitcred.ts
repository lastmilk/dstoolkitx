/**
 * Git 推送凭证（本浏览器存储）
 *  - username = Git 推送用户名（英文/数字/下划线，含中文用户名的用户首次生成 key 前设置）
 *  - apiKey   = dstkg_ 开头的 Git APIKey 明文（仅在创建/首次录入时获得，保存到本浏览器避免重复输入）
 *  - scope    = key 作用域，container 时记录 containerId，用于界面展示与按容器匹配
 */

const CRED_KEY = 'dstoolkit_git_cred'
const STATE_KEY = 'dstoolkit_git_sync_state'

export interface GitCredential {
  gitUsername: string
  apiKey: string
  keyId?: number
  scope: 'global' | 'container'
  containerId?: number | null
  savedAt: number
}

/** 同步基线：repoId（u<uid>_c<cid>）→ 上次成功同步后的提交 */
interface SyncState {
  baseCommits: Record<string, string>
}

function readState(): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return JSON.parse(raw) as SyncState
  } catch { /* 损坏即重置 */ }
  return { baseCommits: {} }
}

function writeState(s: SyncState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s))
}

export function getGitCred(): GitCredential | null {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    return raw ? (JSON.parse(raw) as GitCredential) : null
  } catch {
    return null
  }
}

export function saveGitCred(cred: Omit<GitCredential, 'savedAt'>): GitCredential {
  const full: GitCredential = { ...cred, savedAt: Date.now() }
  localStorage.setItem(CRED_KEY, JSON.stringify(full))
  return full
}

/** key 列表里是否有可复用的（未撤销未过期，且覆盖目标容器） */
export function matchSavedCred(containerId: number | null): GitCredential | null {
  const c = getGitCred()
  if (!c) return null
  if (c.scope === 'global') return c
  return c.containerId === containerId ? c : null
}

export function clearGitCred(): void {
  localStorage.removeItem(CRED_KEY)
}

/** 从创建成功的 key 响应转成凭证（明文仅此一次，立即保存） */
export function credFromCreatedKey(
  gitUsername: string,
  item: { id: number; scope: 'global' | 'container'; containerId: number | null; key: string },
): GitCredential {
  return saveGitCred({
    gitUsername,
    apiKey: item.key,
    keyId: item.id,
    scope: item.scope,
    containerId: item.containerId,
  })
}

export function getBaseCommit(repoId: string): string | null {
  return readState().baseCommits[repoId] ?? null
}

export function setBaseCommit(repoId: string, sha: string): void {
  const s = readState()
  s.baseCommits[repoId] = sha
  writeState(s)
}

export function removeRepoState(repoId: string): void {
  const s = readState()
  delete s.baseCommits[repoId]
  writeState(s)
}
