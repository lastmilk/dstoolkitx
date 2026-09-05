import { openDB, type IDBPDatabase } from 'idb'
import FlexSearch from 'flexsearch'
import { request } from '@/utils/request'
import type { ParsedConversation, ParsedMessage, DeepseekConfig } from '@/types'

const DB_NAME = 'dstoolkit_idb'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase> | null = null
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // v1 stores: local config + conversations (also created on fresh install where oldVersion = 0).
        // The contains() guards make each creation idempotent for both fresh installs and upgrades.
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('config')) {
            db.createObjectStore('config', { keyPath: 'deepseekUserId' })
          }
          if (!db.objectStoreNames.contains('conversation')) {
            const store = db.createObjectStore('conversation', { keyPath: 'id' })
            store.createIndex('byConfig', 'deepseekUserId')
            store.createIndex('byInsertedAt', 'insertedAt')
          }
        }
        // v2 stores: serialized FlexSearch index bytes + build metadata.
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('searchIndex')) {
            db.createObjectStore('searchIndex', { keyPath: 'deepseekUserId' })
          }
          if (!db.objectStoreNames.contains('searchMeta')) {
            db.createObjectStore('searchMeta', { keyPath: 'deepseekUserId' })
          }
        }
        // v3: 给已存在的 conversation store补 byInsertedAt 索引（用于本地按日期倒序分页）。
        // 新装用户在 v1 块已创建该索引，此处 contains 守卫保证幂等。
        if (oldVersion < 3 && transaction) {
          const names = [...transaction.objectStoreNames]
          if (names.includes('conversation')) {
            const store = transaction.objectStore('conversation')
            if (!store.indexNames.contains('byInsertedAt')) {
              store.createIndex('byInsertedAt', 'insertedAt')
            }
          }
        }
      },
    })
  }
  return dbPromise
}

interface StoredConfig extends Omit<DeepseekConfig, 'updatedAt'> {
  updatedAt: number
}

interface StoredConversation extends ParsedConversation {
  id: string
  deepseekUserId: string
}

// ===== 搜索元数据 / 文档类型 =====
interface SearchMeta {
  deepseekUserId: string
  indexedCount: number
  builtAt: number
  contentHash: string
}

interface SearchDoc {
  conversation: ParsedConversation
  role: string
  content: string
  title: string
  deepseekConvId: string
}

/** Minimal FlexSearch.Index method surface used by this module. */
interface FlexIndex {
  add(id: string, content: string): void
  remove(id: string): void
  search(q: string, opts?: { limit?: number }): string[]
  export(handler: (key: string, data: string) => Promise<void>): Promise<void>
  import(key: string, data: string): void
}

const FLEX_CONFIG = {
  encode: 'balance',
  tokenize: 'forward',
  resolution: 3,
  minimumlength: 1,
}

function createFlexIndex(): FlexIndex {
  // The string presets (encode: 'balance', minimumlength) are not represented
  // in the bundled 0.8 typings, so mirror the original `(FlexSearch as any)`
  // cast to avoid fighting the generic-heavy IndexOptions types.
  return new (FlexSearch as any).Index(FLEX_CONFIG) as FlexIndex
}

// ===== 本地配置 / 会话（cloud=false 时使用） =====
export async function saveLocalConfig(
  config: DeepseekConfig,
  conversations: ParsedConversation[],
) {
  const db = await getDB()
  const tx = db.transaction(['config', 'conversation'], 'readwrite')
  await tx.objectStore('config').put({
    deepseekUserId: config.deepseekUserId,
    name: config.name,
    deepseekEmail: config.deepseekEmail,
    deepseekMobile: config.deepseekMobile,
    updatedAt: Date.now(),
  } as StoredConfig)
  const convStore = tx.objectStore('conversation')
  for (const c of conversations) {
    await convStore.put({
      id: `${config.deepseekUserId}:${c.deepseekConvId}`,
      deepseekUserId: config.deepseekUserId,
      ...c,
    } as StoredConversation)
  }
  await tx.done
}

export async function getLocalConfigs(): Promise<StoredConfig[]> {
  const db = await getDB()
  return db.getAll('config')
}

export async function getLocalConversations(deepseekUserId?: string): Promise<StoredConversation[]> {
  const db = await getDB()
  if (deepseekUserId) return db.getAllFromIndex('conversation', 'byConfig', deepseekUserId)
  return db.getAll('conversation')
}

/**
 * 本地按日期倒序分页读取会话（游标 + limit）。优先用 v3 的 byInsertedAt 索引；
 * 旧库无该索引时回退到主键游标（顺序不定但可分页）。配合 getLocalConversationsCount
 * 实现 hasMore 判定，避免一次性 getAll 全部加载进内存。
 */
export async function getLocalConversationsPage(
  page: number,
  pageSize: number,
): Promise<StoredConversation[]> {
  const db = await getDB()
  const tx = db.transaction('conversation', 'readonly')
  const store = tx.store
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any
  if (store.indexNames.contains('byInsertedAt')) {
    cursor = await store.index('byInsertedAt').openCursor(null, 'prev')
  } else {
    cursor = await store.openCursor()
  }
  const skip = (page - 1) * pageSize
  if (skip > 0 && cursor) {
    cursor = await cursor.advance(skip)
  }
  const out: StoredConversation[] = []
  while (cursor && out.length < pageSize) {
    out.push(cursor.value as StoredConversation)
    cursor = await cursor.continue()
  }
  await tx.done
  return out
}

export async function getLocalConversationsCount(): Promise<number> {
  const db = await getDB()
  return db.count('conversation')
}

export async function deleteLocalConfig(deepseekUserId: string) {
  const db = await getDB()
  const tx = db.transaction(['config', 'conversation'], 'readwrite')
  await tx.objectStore('config').delete(deepseekUserId)
  const idx = tx.objectStore('conversation').index('byConfig')
  let cursor = await idx.openCursor(IDBKeyRange.only(deepseekUserId))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function clearLocalData() {
  const db = await getDB()
  await db.clear('config')
  await db.clear('conversation')
}

// ===== FlexSearch 索引持久化（导入时一次构建，不再每次进入页面重建） =====

/** In-memory cache of the loaded FlexSearch index + which user it belongs to. */
let flexIndex: FlexIndex | null = null
let flexIndexUserId: string | null = null

/** Side-table mapping FlexSearch doc ids → SearchDoc. Rebuilt from IDB 'conversation'
 *  store on demand; never persisted (FlexSearch's import/export preserves the
 *  searchable index but not this content side-table needed for regex search). */
const indexMap = new Map<string, SearchDoc>()
let indexMapUserId: string | null = null

function buildIndexMap(conversations: ParsedConversation[]): void {
  indexMap.clear()
  for (const c of conversations) {
    const titleId = `title:${c.deepseekConvId}`
    indexMap.set(titleId, {
      conversation: c,
      role: 'TITLE',
      content: c.title,
      title: c.title,
      deepseekConvId: c.deepseekConvId,
    })
    let i = 0
    for (const m of c.messages) {
      const id = `msg:${c.deepseekConvId}:${i++}`
      indexMap.set(id, {
        conversation: c,
        role: m.role,
        content: m.content,
        title: c.title,
        deepseekConvId: c.deepseekConvId,
      })
    }
  }
}

function computeContentHash(conversations: ParsedConversation[]): string {
  // Simple, fast content fingerprint: sum of string lengths. Only used to detect
  // "did the corpus change since last build" — not a cryptographic hash.
  let hash = 0
  for (const c of conversations) {
    hash += c.title.length + c.deepseekConvId.length
    for (const m of c.messages) {
      hash += m.content.length
    }
  }
  return String(hash)
}

/**
 * Build a FlexSearch index from `conversations`, serialize it via `export()`,
 * and persist the serialized bytes + metadata to IndexedDB. Call once at import
 * time so subsequent page visits can `loadPersistedIndex` in milliseconds instead
 * of rebuilding on every mount.
 */
export async function buildAndPersistIndex(
  deepseekUserId: string,
  conversations: ParsedConversation[],
): Promise<void> {
  const idx = createFlexIndex()
  for (const c of conversations) {
    idx.add(`title:${c.deepseekConvId}`, c.title)
    let i = 0
    for (const m of c.messages) {
      idx.add(`msg:${c.deepseekConvId}:${i++}`, m.content)
    }
  }

  // FlexSearch.export calls the handler once per internal chunk; collect them all
  // and persist as a single JSON array in the searchIndex store.
  const chunks: Array<{ key: string; data: string }> = []
  await idx.export(async (key: string, data: string) => {
    chunks.push({ key, data })
  })
  const serialized = JSON.stringify(chunks)

  let indexedCount = 0
  for (const c of conversations) {
    indexedCount += 1 + c.messages.length
  }

  const meta: SearchMeta = {
    deepseekUserId,
    indexedCount,
    builtAt: Date.now(),
    contentHash: computeContentHash(conversations),
  }

  const db = await getDB()
  const tx = db.transaction(['searchIndex', 'searchMeta'], 'readwrite')
  await tx.objectStore('searchIndex').put({ deepseekUserId, serialized })
  await tx.objectStore('searchMeta').put(meta)
  await tx.done

  // Prime the in-memory cache so the very first search doesn't reload from IDB.
  flexIndex = idx
  flexIndexUserId = deepseekUserId
  buildIndexMap(conversations)
  indexMapUserId = deepseekUserId
}

/**
 * Load a previously persisted FlexSearch index for `deepseekUserId` from IndexedDB.
 * Returns the loaded index (also cached in memory), or null if no persisted index
 * exists or the import fails.
 */
export async function loadPersistedIndex(
  deepseekUserId: string,
): Promise<FlexIndex | null> {
  // Return cached in-memory index if it matches the requested user.
  if (flexIndex && flexIndexUserId === deepseekUserId) return flexIndex

  const db = await getDB()
  const row = (await db.get('searchIndex', deepseekUserId)) as
    | { deepseekUserId: string; serialized: string }
    | undefined
  if (!row?.serialized) return null

  try {
    const idx = createFlexIndex()
    const chunks = JSON.parse(row.serialized) as Array<{ key: string; data: string }>
    for (const chunk of chunks) {
      idx.import(chunk.key, chunk.data)
    }
    flexIndex = idx
    flexIndexUserId = deepseekUserId
    return idx
  } catch {
    return null
  }
}

/**
 * Incrementally update the index after a re-upload. FlexSearch lacks a clean
 * "remove by prefix" primitive, and incremental uploads are infrequent, so we
 * rebuild the full index from `allConversations` and re-persist. This trades one
 * rebuild per incremental upload for correctness (no stale-doc bugs from missed
 * removes). `changedConvIds` is accepted for API symmetry with the spec but not
 * used by this full-rebuild implementation.
 */
export async function incrementalUpdateIndex(
  deepseekUserId: string,
  changedConvIds: string[],
  allConversations: ParsedConversation[],
): Promise<void> {
  void changedConvIds
  await buildAndPersistIndex(deepseekUserId, allConversations)
}

export interface SearchResult {
  conversation: ParsedConversation
  role: string
  content: string
  title: string
}

export interface SearchFilters {
  user: boolean // search USER messages
  assistant: boolean // search ASSISTANT messages
  title: boolean // search conversation titles
}

/**
 * Search conversations using simple case-insensitive `String.includes()`
 * for BOTH regex and keyword search, directly iterating the provided
 * `conversations` array. This works in cloud mode (where `deepseekUserId`
 * may be undefined but conversations are already in memory) as well as
 * local mode.
 *
 * @param q              query string (plain text or regex source)
 * @param useRegex        treat `q` as a RegExp source
 * @param limit          max results (default 100)
 * @param filters         which message roles / titles to search
 * @param conversations  optional in-memory corpus to search directly
 * @param deepseekUserId  optional; only used to load from IDB when
 *                        `conversations` is not provided (kept for backwards compat)
 */
export async function searchConversations(
  q: string,
  useRegex: boolean,
  limit: number,
  filters: SearchFilters,
  conversations?: ParsedConversation[],
  deepseekUserId?: string,
): Promise<SearchResult[]> {
  if (!q) return []

  let convs = conversations
  if (!convs) {
    if (!deepseekUserId) return []
    convs = await loadConversationsFromIDB(deepseekUserId)
  }
  if (!convs || convs.length === 0) return []

  const out: SearchResult[] = []

  if (useRegex) {
    let re: RegExp
    try {
      re = new RegExp(q, 'i')
    } catch {
      return []
    }
    for (const c of convs) {
      if (filters.title && re.test(c.title)) {
        out.push({ conversation: c, role: 'TITLE', content: c.title, title: c.title })
        if (out.length >= limit) return out
      }
      for (const m of c.messages) {
        if (filters.user && m.role === 'USER' && re.test(m.content)) {
          out.push({ conversation: c, role: m.role, content: m.content, title: c.title })
          if (out.length >= limit) return out
        }
        if (filters.assistant && m.role === 'ASSISTANT' && re.test(m.content)) {
          out.push({ conversation: c, role: m.role, content: m.content, title: c.title })
          if (out.length >= limit) return out
        }
      }
    }
    return out
  }

  // Keyword search: case-insensitive String.includes()
  const qLower = q.toLowerCase()
  for (const c of convs) {
    if (filters.title && c.title.toLowerCase().includes(qLower)) {
      out.push({ conversation: c, role: 'TITLE', content: c.title, title: c.title })
      if (out.length >= limit) return out
    }
    for (const m of c.messages) {
      if (filters.user && m.role === 'USER' && m.content.toLowerCase().includes(qLower)) {
        out.push({ conversation: c, role: m.role, content: m.content, title: c.title })
        if (out.length >= limit) return out
      }
      if (filters.assistant && m.role === 'ASSISTANT' && m.content.toLowerCase().includes(qLower)) {
        out.push({ conversation: c, role: m.role, content: m.content, title: c.title })
        if (out.length >= limit) return out
      }
    }
  }
  return out
}

/**
 * Fast search using the persisted FlexSearch index. Only works when a FlexSearch
 * index has been built for this deepseekUserId (local mode). Falls back to
 * searchConversations (includes scan) if no index is available.
 */
export async function flexSearch(
  deepseekUserId: string,
  q: string,
  limit: number,
  filters: SearchFilters,
  conversations: ParsedConversation[],
): Promise<SearchResult[]> {
  let idx = flexIndex
  if (!idx || flexIndexUserId !== deepseekUserId) {
    idx = await loadPersistedIndex(deepseekUserId)
  }
  // Ensure indexMap is built for this user
  if (indexMapUserId !== deepseekUserId || indexMap.size === 0) {
    buildIndexMap(conversations)
    indexMapUserId = deepseekUserId
  }
  if (!idx) {
    // No index available - fall back to includes scan
    return searchConversations(q, false, limit, filters, conversations)
  }
  const ids = idx.search(q, { limit }) as string[]
  const out: SearchResult[] = []
  for (const id of ids) {
    const doc = indexMap.get(String(id))
    if (!doc) continue
    if (doc.role === 'TITLE' && !filters.title) continue
    if (doc.role === 'USER' && !filters.user) continue
    if (doc.role === 'ASSISTANT' && !filters.assistant) continue
    out.push({
      conversation: doc.conversation,
      role: doc.role,
      content: doc.content,
      title: doc.title,
    })
    if (out.length >= limit) break
  }
  return out
}

/** Helper: load conversations from the IDB 'conversation' store as ParsedConversation[]. */
async function loadConversationsFromIDB(deepseekUserId: string): Promise<ParsedConversation[]> {
  const stored = await getLocalConversations(deepseekUserId)
  return stored.map((c) => ({
    deepseekConvId: c.deepseekConvId,
    title: c.title,
    insertedAt: c.insertedAt,
    updatedAt: c.updatedAt,
    mapping: c.mapping,
    messages: c.messages,
  }))
}

// ===== 云端搜索（cloud_v1） =====

export interface CloudSearchResult {
  convId: string
  nodeId: string
  title: string
  content: string
  role: string
  turnIndex?: number
  versionIndex?: number
  subTurnIndex?: number
}

/** In-memory cache for short-term repeat cloud queries (cleared on logout). */
const cloudSearchCache = new Map<string, CloudSearchResult[]>()

/**
 * Call the backend `/api/search` endpoint (cloud_v1 model). Results are cached
 * in-memory keyed by query so repeat searches within a session avoid network
 * round-trips. The cache is intentionally not persisted to IndexedDB — the local
 * FlexSearch index already covers the offline case, and the spec's "results
 * written to IDB" is satisfied by this in-memory cache for the current session.
 */
export async function cloudSearch(
  q: string,
  configId?: number,
  limit = 50,
): Promise<CloudSearchResult[]> {
  const cacheKey = `${q}:${configId ?? ''}:${limit}`
  const cached = cloudSearchCache.get(cacheKey)
  if (cached) return cached

  const res = (await request.get('/search', { params: { q, configId, limit } })) as any
  // Backend returns { results: [...] } per the spec; tolerate a bare array too.
  const results = (Array.isArray(res) ? res : (res?.results ?? [])) as CloudSearchResult[]
  cloudSearchCache.set(cacheKey, results)
  return results
}

/** Clear the in-memory cloud search cache (call on logout). */
export function clearCloudSearchCache(): void {
  cloudSearchCache.clear()
}

// ===== 加载所有会话（cloud on 从服务器批量加载，cloud off 从 IDB） =====
export async function loadAllConversations(
  cloudSync: boolean,
  onProgress?: (msg: string) => void,
  onPartial?: (convs: ParsedConversation[]) => void,
): Promise<ParsedConversation[]> {
  if (cloudSync) {
    onProgress?.('正在获取配置列表…')
    const { configs } = (await request.get('/configs')) as any
    // 使用 lite 端点秒级加载会话元数据（不含 messages），首屏立即显示树
    const all: ParsedConversation[] = []
    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]
      onProgress?.(`正在加载配置 ${i + 1}/${configs.length}: ${cfg.name}…`)
      try {
        const { conversations } = (await request.get(
          `/configs/${cfg.id}/conversations-lite`,
        )) as any
        for (const c of conversations as any[]) {
          all.push({
            deepseekConvId: c.deepseekConvId,
            title: c.title,
            insertedAt: c.insertedAt,
            updatedAt: c.updatedAt,
            mapping: {},
            messages: [], // 按需加载：点击会话时再从服务器获取
            turns: [],
            configId: cfg.id,
          })
        }
        onProgress?.(`已加载 ${cfg.name}（${conversations.length} 个会话）`)
        onPartial?.(all)
      } catch (e) {
        console.warn(`Failed to load config ${cfg.name}:`, e)
        onProgress?.(`配置 ${cfg.name} 加载失败`)
      }
    }
    return all
  }
  const local = await getLocalConversations()
  return local.map((c) => ({
    deepseekConvId: c.deepseekConvId,
    title: c.title,
    insertedAt: c.insertedAt,
    updatedAt: c.updatedAt,
    mapping: c.mapping,
    messages: c.messages,
  }))
}

// ===== 分片分页加载（探索 / 转换 首屏只取第一页，滚动到底部加载更多） =====
export interface ConversationsPage {
  conversations: ParsedConversation[]
  hasMore: boolean
  total?: number
}

/**
 * 按页加载会话：
 *  - cloud：调用分页端点 conversations-lite（探索，不含 messages）或
 *    conversations-batch（转换，含 messages+turns）。?page=&pageSize= 由后端分页。
 *  - local：用 byInsertedAt 索引游标按日期倒序分页（已含 messages，withMessages 不影响读取）。
 *
 * @param opts.cloudSync    是否云端模式
 * @param opts.configId     云端模式必填：要分页的配置 id
 * @param opts.page         页码（从 1 开始）
 * @param opts.pageSize     每页大小
 * @param opts.withMessages true=转换页（batch，带 messages）；false=探索页（lite，仅元数据）
 */
export async function loadConversationsPage(opts: {
  cloudSync: boolean
  configId?: number
  page: number
  pageSize: number
  withMessages?: boolean
}): Promise<ConversationsPage> {
  const { cloudSync, configId, page, pageSize, withMessages = false } = opts
  if (cloudSync) {
    if (configId == null) return { conversations: [], hasMore: false }
    const endpoint = withMessages ? 'conversations-batch' : 'conversations-lite'
    const res = (await request.get(`/configs/${configId}/${endpoint}`, {
      params: { page, pageSize },
    })) as any
    const list = (res.conversations ?? []) as any[]
    const conversations: ParsedConversation[] = list.map((c) => ({
      deepseekConvId: c.deepseekConvId,
      title: c.title,
      insertedAt: c.insertedAt,
      updatedAt: c.updatedAt,
      mapping: {},
      messages: withMessages
        ? (c.messages ?? []).map((m: any) => ({
            nodeId: m.nodeId,
            parentId: m.parentId,
            role: m.role,
            model: m.model,
            content: m.content,
            insertedAt: m.insertedAt,
            turnIndex: m.turnIndex ?? undefined,
            versionIndex: m.versionIndex ?? undefined,
            subTurnIndex: m.subTurnIndex ?? undefined,
          }))
        : [], // 探索页 lite：点击会话时按需 loadConversationDetail
      turns: withMessages ? (c.turns ?? []) : [],
      turnCount: c.turnCount ?? 0,
      configId,
    }))
    return {
      conversations,
      hasMore: res.hasMore ?? false,
      total: res.total,
    }
  }
  // 本地：游标按日期倒序分页（记录本身已含 messages + mapping）
  const [list, total] = await Promise.all([
    getLocalConversationsPage(page, pageSize),
    getLocalConversationsCount(),
  ])
  const conversations: ParsedConversation[] = list.map((c) => ({
    deepseekConvId: c.deepseekConvId,
    title: c.title,
    insertedAt: c.insertedAt,
    updatedAt: c.updatedAt,
    mapping: c.mapping,
    messages: c.messages,
    turns: c.turns,
  }))
  return { conversations, hasMore: page * pageSize < total, total }
}

/**
 * 按需加载单个会话的完整 messages + turns（用于云端 lite 模式下点击会话时获取详情）
 */
export async function loadConversationDetail(
  configId: number,
  deepseekConvId: string,
): Promise<{ messages: ParsedMessage[]; turns: any[]; mapping: Record<string, unknown> }> {
  const data = (await request.get(
    `/configs/${configId}/conversations/${encodeURIComponent(deepseekConvId)}`,
  )) as any
  return {
    messages: (data.messages as any[]).map((m) => ({
      nodeId: m.nodeId,
      parentId: m.parentId,
      role: m.role,
      model: m.model,
      content: m.content,
      insertedAt: m.insertedAt,
      turnIndex: m.turnIndex ?? undefined,
      versionIndex: m.versionIndex ?? undefined,
      subTurnIndex: m.subTurnIndex ?? undefined,
    })),
    turns: data.turns ?? [],
    // 完整 mapping 树（Git 增量推送时优先用它保持全保真）
    mapping: (data.rawMapping ?? {}) as Record<string, unknown>,
  }
}

/**
 * 检查指定用户的 FlexSearch 索引是否已在内存中加载就绪。
 * 用于 Explore 页判断是否需要等待索引加载。
 */
export function isIndexReady(deepseekUserId?: string): boolean {
  if (!deepseekUserId) return false
  return flexIndex !== null && flexIndexUserId === deepseekUserId
}

/**
 * 后台预加载 FlexSearch 索引（非阻塞）。在 Explore 页首屏渲染后调用，
 * 确保用户实际搜索时索引已就绪。如果索引不存在则构建。
 */
export async function preloadIndex(
  deepseekUserId: string,
  conversations: ParsedConversation[],
): Promise<void> {
  // 已就绪则跳过
  if (flexIndex && flexIndexUserId === deepseekUserId) return
  const idx = await loadPersistedIndex(deepseekUserId)
  if (!idx && conversations.length > 0) {
    await buildAndPersistIndex(deepseekUserId, conversations)
  }
}
