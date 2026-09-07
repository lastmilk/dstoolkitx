// ══════════ API 密钥（DeepSeek 等第三方密钥）══════════

export interface ApiKeyItem {
  id: number
  name: string
  masked: string
  createdAt: string
}

// ══════════ API 访问令牌（dstk_ RESTful 令牌）══════════

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
  token: string
  prefix: string
  createdAt: string
  expiresAt: string | null
}

// ══════════ Git 凭证 ══════════

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

export interface GitContainer {
  id: number
  name: string
}

// ══════════ OAuth2 应用 ══════════

export interface OAuthClient {
  id: number
  clientId: string
  name: string
  redirectUris: string[]
  scopes: string[]
  isPublic: boolean
  enabled: boolean
  createdAt: string
}

// ══════════ 对话容器（Git 作用域选择用）══════════

export interface DeepseekConfig {
  id: number
  name: string
  deepseekUserId: string
  conversationCount?: number
  createdAt?: string
  updatedAt?: string
}
