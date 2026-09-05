export interface DeepseekConfig {
  id: number | null
  name: string
  deepseekUserId: string
  deepseekEmail?: string | null
  deepseekMobile?: string | null
  conversationCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface ParsedMessage {
  nodeId: string
  parentId: string | null
  role: 'USER' | 'ASSISTANT'
  model: string | null
  content: string
  insertedAt: string
  turnIndex?: number | null
  versionIndex?: number | null
  subTurnIndex?: number | null
}

export interface SubTurn {
  subTurnIndex: number
  userNodeId: string
  assistantNodeId: string | null
}

export interface Version {
  versionIndex: number
  assistantNodeId: string
  subTurns: SubTurn[]
}

export interface Turn {
  turnIndex: number
  userNodeId: string
  versions: Version[]
}

export interface ParsedConversation {
  deepseekConvId: string
  title: string
  insertedAt: string
  updatedAt: string
  mapping: Record<string, unknown>
  messages: ParsedMessage[]
  turns?: Turn[]
  turnCount?: number  // 云端 lite 模式下来自 DB 的轮次数（turns 为空时用于树标签）
  configId?: number  // 云端 lite 模式下用于按需加载 messages
}

export interface UploadResult {
  persisted: boolean
  config: DeepseekConfig
  deepseekUser: { userId: string; email: string | null; mobile: string | null }
  /** cloud=false 时返回全部会话（前端存 IndexedDB）；cloud=true 时不回传 */
  conversations?: ParsedConversation[]
  /** cloud=true 时返回会话总数（前端按需分页加载） */
  conversationCount?: number
}

export interface ConversationSummary {
  id: number
  deepseekConvId: string
  title: string
  insertedAt: string
  updatedAt: string
  _count?: { messages: number }
  messageCount?: number
}

export interface ApiKeyItem {
  id: number
  name: string
  masked: string
  createdAt: string
}

export interface ApiTokenItem {
  id: number
  name: string
  prefix: string
  masked: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface CreatedApiToken {
  id: number
  name: string
  token: string // 明文令牌，仅创建时返回一次
  prefix: string
  createdAt: string
  expiresAt: string | null
}

// ══════════ Git 生态 ══════════

/** Git APIKey 条目（GET /gitkeys 返回，明文仅创建时返回一次） */
export interface GitApiKeyItem {
  id: number
  name: string
  prefix: string
  masked: string
  scope: 'global' | 'container'
  containerId: number | null
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  key?: string
}

export interface GitKeysInfo {
  username: string
  gitUsername: string | null
  needsGitUsername: boolean
  keys: GitApiKeyItem[]
}

export interface GitRepoInfo {
  repoUrl: string
  gitUsername: string | null
  needsGitUsername: boolean
  hasKey: boolean
  defaultBranch: string
}

/** 新建 Git APIKey 的表单参数 */
export interface CreateGitKeyPayload {
  name: string
  containerId?: number | null
  expiresInDays?: number
  confirmGlobal?: boolean
}

export interface MarketEntry {
  id: number
  name: string
  url: string
  description?: string
  category: string
  createdAt: string
}
