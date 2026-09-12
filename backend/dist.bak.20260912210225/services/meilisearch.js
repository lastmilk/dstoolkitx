import { Meilisearch as MeiliSearch, MeilisearchApiError, ErrorStatusCode } from 'meilisearch';
import { env } from '../config/env.js';
let client = null;
// Lazy singleton client getter; returns null when Meilisearch is disabled.
export function getClient() {
    if (!env.meiliEnabled)
        return null;
    if (!client) {
        client = new MeiliSearch({
            host: env.meiliHost,
            apiKey: env.meiliApiKey,
        });
    }
    return client;
}
export function indexName(userId) {
    return 'dstoolkit_' + userId;
}
// Ensure the per-user index exists and is configured. Best-effort: logs on
// failure and never throws (graceful degradation for cloud_v1 search).
export async function ensureIndex(userId) {
    const c = getClient();
    if (!c)
        return;
    const name = indexName(userId);
    try {
        await c.getIndex(name);
    }
    catch (e) {
        if (!(e instanceof MeilisearchApiError) || e.cause?.code !== ErrorStatusCode.INDEX_NOT_FOUND) {
            console.error('[meilisearch] getIndex failed', e);
            return;
        }
        try {
            await c.createIndex(name);
            const index = c.index(name);
            await index.updateSearchableAttributes(['content', 'title']);
            await index.updateFilterableAttributes([
                'userId',
                'configId',
                'convId',
                'role',
                'model',
                'turnIndex',
                'versionIndex',
                'subTurnIndex',
            ]);
            await index.updateSortableAttributes(['insertedAt']);
        }
        catch (err) {
            console.error('[meilisearch] ensureIndex failed', err);
        }
    }
}
export async function indexDocuments(userId, docs) {
    const c = getClient();
    if (!c)
        return;
    try {
        await ensureIndex(userId);
        const index = c.index(indexName(userId));
        await index.addDocuments(docs);
    }
    catch (e) {
        console.error('[meilisearch] indexDocuments failed', e);
    }
}
export async function deleteDocuments(userId, docIds) {
    const c = getClient();
    if (!c)
        return;
    try {
        await ensureIndex(userId);
        const index = c.index(indexName(userId));
        await index.deleteDocuments(docIds);
    }
    catch (e) {
        console.error('[meilisearch] deleteDocuments failed', e);
    }
}
export async function search(userId, q, opts) {
    const c = getClient();
    if (!c)
        return { results: [] };
    try {
        await ensureIndex(userId);
        const index = c.index(indexName(userId));
        const res = await index.search(q, {
            limit: opts?.limit ?? 50,
            filter: opts?.configId ? `configId = ${opts.configId}` : undefined,
        });
        const results = res.hits.map((hit) => ({
            convId: hit.convId,
            nodeId: hit.nodeId,
            title: hit.title,
            content: hit.content,
            role: hit.role,
            turnIndex: hit.turnIndex,
            versionIndex: hit.versionIndex,
            subTurnIndex: hit.subTurnIndex,
        }));
        return { results };
    }
    catch (e) {
        console.error('[meilisearch] search failed', e);
        return { results: [] };
    }
}
//# sourceMappingURL=meilisearch.js.map