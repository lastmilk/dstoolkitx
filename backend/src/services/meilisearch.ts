import { Meilisearch as MeiliSearch, MeilisearchApiError, ErrorStatusCode } from 'meilisearch'
import { env } from '../config/env.js'

export type MeiliDoc = {
  id: string
  userId: number
  configId: number
  convId: string
  nodeId: string
  title: string
  content: string
  role: string
  model: string | null
  turnIndex: number | null
  versionIndex: number | null
  subTurnIndex: number | null
  insertedAt: string
}

export type MeiliSearchResult = {
  convId: string
  nodeId: string
  title: string
  content: string
  role: string
  turnIndex: number | null
  versionIndex: number | null
  subTurnIndex: number | null
}

let client: MeiliSearch | null = null

// Lazy singleton client getter; returns null when Meilisearch is disabled.
export function getClient(): MeiliSearch | null {
  if (!env.meiliEnabled) return null
  if (!client) {
    client = new MeiliSearch({
      host: env.meiliHost,
      apiKey: env.meiliApiKey,
    })
  }
  return client
}

export function indexName(userId: number): string {
  return 'dstoolkit_' + userId
}

// Ensure the per-user index exists and is configured. Best-effort: logs on
// failure and never throws (graceful degradation for cloud_v1 search).
export async function ensureIndex(userId: number): Promise<void> {
  const c = getClient()
  if (!c) return
  const name = indexName(userId)
  try {
    await c.getIndex(name)
  } catch (e) {
    if (!(e instanceof MeilisearchApiError) || e.cause?.code !== ErrorStatusCode.INDEX_NOT_FOUND) {
      console.error('[meilisearch] getIndex failed', e)
      return
    }
    try {
      await c.createIndex(name)
      const index = c.index(name)
      await index.updateSearchableAttributes(['content', 'title'])
      await index.updateFilterableAttributes([
        'userId',
        'configId',
        'convId',
        'role',
        'model',
        'turnIndex',
        'versionIndex',
        'subTurnIndex',
      ])
      await index.updateSortableAttributes(['insertedAt'])
    } catch (err) {
      console.error('[meilisearch] ensureIndex failed', err)
    }
  }
}

export async function indexDocuments(userId: number, docs: MeiliDoc[]): Promise<void> {
  const c = getClient()
  if (!c) return
  try {
    await ensureIndex(userId)
    const index = c.index<MeiliDoc>(indexName(userId))
    await index.addDocuments(docs)
  } catch (e) {
    console.error('[meilisearch] indexDocuments failed', e)
  }
}

export async function deleteDocuments(userId: number, docIds: string[]): Promise<void> {
  const c = getClient()
  if (!c) return
  try {
    await ensureIndex(userId)
    const index = c.index(indexName(userId))
    await index.deleteDocuments(docIds)
  } catch (e) {
    console.error('[meilisearch] deleteDocuments failed', e)
  }
}

export async function search(
  userId: number,
  q: string,
  opts?: { limit?: number; configId?: number },
): Promise<{ results: MeiliSearchResult[] }> {
  const c = getClient()
  if (!c) return { results: [] }
  try {
    await ensureIndex(userId)
    const index = c.index<MeiliDoc>(indexName(userId))
    const res = await index.search(q, {
      limit: opts?.limit ?? 50,
      filter: opts?.configId ? `configId = ${opts.configId}` : undefined,
    })
    const results: MeiliSearchResult[] = res.hits.map((hit) => ({
      convId: hit.convId,
      nodeId: hit.nodeId,
      title: hit.title,
      content: hit.content,
      role: hit.role,
      turnIndex: hit.turnIndex,
      versionIndex: hit.versionIndex,
      subTurnIndex: hit.subTurnIndex,
    }))
    return { results }
  } catch (e) {
    console.error('[meilisearch] search failed', e)
    return { results: [] }
  }
}
