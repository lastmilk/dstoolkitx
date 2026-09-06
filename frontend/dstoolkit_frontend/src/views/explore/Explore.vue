<script setup lang="ts">
/**
 * 对话探索页（Element Plus 版本）
 *  - 会话列表分页加载：云端 lite 模式（GET /configs 后按配置逐页 loadConversationsPage，
 *    hasMore 状态按配置维护）与本地 IndexedDB 游标分页，列表底部"加载更多"按钮翻页
 *  - 搜索双模式：云端开启时走 cloudSearch（/search，AI 过滤关键词 OR 前置拼接）；
 *    本地模式走 FlexSearch 索引（flexSearch），正则/无索引时降级 includes 扫描
 *    （searchConversations），支持正则开关与标题/用户消息/模型回复过滤
 *  - 搜索建议：/search/suggest（el-autocomplete 内置 300ms 防抖，仅云端模式）
 *  - AI 智能过滤：/search/filters（el-check-tag 单选切换）
 *  - 索引预加载：首屏后台 preloadIndex 预热，搜索时 isIndexReady 兜底等待
 *  - 按需详情：云端 lite 会话（messages 为空）点击时 loadConversationDetail 补全
 *  - 右侧 ChatViewer 查看/继续对话；API Key 列表来自 GET /apikeys
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import {
  ArrowDown,
  DArrowLeft,
  Filter,
  MagicStick,
  Refresh,
  Search,
  Timer,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useSearchModelStore, type SearchModel } from '@/stores/searchModel'
import {
  cloudSearch,
  flexSearch,
  getLocalConfigs,
  isIndexReady,
  loadAllConversations,
  loadConversationDetail,
  loadConversationsPage,
  preloadIndex,
  searchConversations,
  type CloudSearchResult,
  type SearchFilters,
  type SearchResult,
} from '@/utils/db'
import { request } from '@/utils/request'
import ChatViewer from '@/components/ChatViewer.vue'
import GitConflictDialog from '@/components/GitConflictDialog.vue'
import type { ParsedConversation } from '@/types'
import {
  prepareGitSync,
  syncSingleConversation,
  resolveConflicts,
  type GitSyncContext,
  type ConflictResolution,
} from '@/utils/gitclient'

const auth = useAuthStore()
const searchModelStore = useSearchModelStore()

// ═══════════ 响应式：窄屏时列表/详情二选一 ═══════════
const isMobile = ref(false)
function checkViewport() {
  isMobile.value = window.innerWidth < 820
}
const showDetail = ref(false)
watch(isMobile, (mobile) => {
  if (!mobile) showDetail.value = false
})

// ═══════════ 基础状态 ═══════════
const loading = ref(false)
const loadProgress = ref('')
const loadTime = ref<number | null>(null)
const conversations = ref<ParsedConversation[]>([])
const query = ref('')
const useRegex = ref(false)
const mode = ref<'timeline' | 'search'>('timeline')

const activeConv = ref<ParsedConversation | null>(null)
const apiKeys = ref<Array<{ id: number; name: string }>>([])
const detailLoading = ref(false)

const searchFilters = ref<SearchFilters>({ user: true, assistant: true, title: true })
const localUserId = ref<string | undefined>(undefined)

// ═══════════ 分页状态 ═══════════
const EXPLORE_PAGE_SIZE = 50
const localPage = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)
const totalConvs = ref<number | undefined>(undefined)
const cloudConfigStates = ref<Array<{ id: number; name: string; page: number; hasMore: boolean }>>([])

// ═══════════ AI 智能过滤 ═══════════
const aiFilters = ref<{ id: string; label: string; keywords: string[] }[]>([])
const activeAiFilter = ref<string | null>(null)

// ═══════════ 搜索结果（按会话聚合，带首条命中摘要） ═══════════
type SearchListItem = {
  conv: ParsedConversation
  snippet: string
  role: string
}
const searchResults = ref<SearchListItem[]>([])
const unmatchedCloudCount = ref(0)

const displayList = computed<SearchListItem[]>(() => {
  if (mode.value === 'search') return searchResults.value
  return conversations.value.map((conv) => ({ conv, snippet: '', role: '' }))
})

// ═══════════ 本地全量语料缓存（搜索用，首次搜索时惰性加载） ═══════════
let localCorpus: ParsedConversation[] | null = null
let localCorpusPromise: Promise<ParsedConversation[]> | null = null
let preloadPromise: Promise<void> | null = null

function ensureLocalCorpus(): Promise<ParsedConversation[]> {
  if (localCorpus) return Promise.resolve(localCorpus)
  if (!localCorpusPromise) {
    localCorpusPromise = loadAllConversations(false).then((convs) => {
      localCorpus = convs
      return convs
    })
  }
  return localCorpusPromise
}

/** 确保 FlexSearch 索引就绪（首屏已后台预热，此处兜底等待）；失败不阻塞搜索 */
function ensureIndexReady(): Promise<void> {
  if (!localUserId.value || isIndexReady(localUserId.value)) return Promise.resolve()
  if (!preloadPromise) {
    const uid = localUserId.value
    preloadPromise = ensureLocalCorpus()
      .then((corpus) => preloadIndex(uid, corpus))
      .catch((e) => {
        preloadPromise = null
        throw e
      })
  }
  return preloadPromise
}

// ═══════════ 搜索（输入防抖 / 建议 / 回车） ═══════════
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let suggestionSelectedAt = 0

function scheduleSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null
    void doSearch()
  }, 300)
}

function clearSearchDebounce() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
}

function onQueryInput(_value: string | number) {
  scheduleSearch()
}

function onQueryClear() {
  clearSearchDebounce()
  void doSearch()
}

function onSearchEnter() {
  // 选中建议时的 Enter 已在 select 事件中触发搜索，跳过紧跟的 keyup
  if (Date.now() - suggestionSelectedAt < 200) return
  clearSearchDebounce()
  void doSearch()
}

// ═══════════ 搜索建议（el-autocomplete，仅云端模式） ═══════════
type SuggestionItem = {
  value: string
  text: string
  type: string
}

async function fetchSuggestions(q: string, cb: (items: SuggestionItem[]) => void) {
  const kw = q.trim()
  if (!auth.cloudSyncEnabled || !kw) {
    cb([])
    return
  }
  try {
    const res = (await request.get('/search/suggest', { params: { q: kw, limit: 8 } })) as any
    const list = (res.suggestions ?? []) as Array<{ text: string; type: string }>
    cb(list.map((s) => ({ value: s.text, text: s.text, type: s.type })))
  } catch {
    cb([])
  }
}

function onSuggestionSelect(item: SuggestionItem) {
  suggestionSelectedAt = Date.now()
  clearSearchDebounce()
  if (query.value !== item.text) query.value = item.text
  void doSearch()
}

function suggestionTypeLabel(type: string): string {
  if (type === 'history') return '历史搜索'
  if (type === 'popular') return '热门'
  return '对话标题'
}

// ═══════════ 搜索执行 ═══════════
async function doSearch() {
  const q = query.value.trim()
  if (!q) {
    searchResults.value = []
    unmatchedCloudCount.value = 0
    mode.value = 'timeline'
    return
  }
  mode.value = 'search'
  loading.value = true
  try {
    if (auth.cloudSyncEnabled) {
      let cloudQ = q
      if (activeAiFilter.value) {
        const f = aiFilters.value.find((x) => x.id === activeAiFilter.value)
        if (f && f.keywords.length > 0) {
          cloudQ = `(${f.keywords.join(' OR ')}) ${q}`
        }
      }
      const results = await cloudSearch(cloudQ, undefined, 200)
      aggregateCloudResults(results as CloudSearchResult[])
    } else {
      // 本地 v1：优先 FlexSearch 索引；正则/无索引时降级 includes 扫描
      const corpus = await ensureLocalCorpus()
      await ensureIndexReady().catch(() => {})
      const results = useRegex.value
        ? await searchConversations(q, true, 200, searchFilters.value, corpus)
        : localUserId.value
          ? await flexSearch(localUserId.value, q, 200, searchFilters.value, corpus)
          : await searchConversations(q, false, 200, searchFilters.value, corpus)
      aggregateLocalResults(results)
    }
  } catch (e) {
    console.warn('Search failed:', e)
  } finally {
    loading.value = false
  }
}

/** 云端搜索结果 → 按会话聚合（仅展示已加载到列表的会话，其余计数提示） */
function aggregateCloudResults(results: CloudSearchResult[]) {
  const byConv = new Map<string, SearchListItem>()
  const unmatchedIds = new Set<string>()
  for (const r of results) {
    if (byConv.has(r.convId)) continue
    const conv = conversations.value.find((c) => c.deepseekConvId === r.convId)
    if (!conv) {
      unmatchedIds.add(r.convId)
      continue
    }
    byConv.set(r.convId, { conv, snippet: r.content, role: r.role })
  }
  searchResults.value = Array.from(byConv.values())
  unmatchedCloudCount.value = unmatchedIds.size
}

/** 本地搜索结果 → 按会话聚合（语料自带 messages，无需再加载详情） */
function aggregateLocalResults(results: SearchResult[]) {
  const byConv = new Map<string, SearchListItem>()
  for (const r of results) {
    const id = r.conversation.deepseekConvId
    if (byConv.has(id)) continue
    byConv.set(id, { conv: r.conversation, snippet: r.content, role: r.role })
  }
  searchResults.value = Array.from(byConv.values())
  unmatchedCloudCount.value = 0
}

// ═══════════ 搜索模式 / 视图切换 ═══════════
type SegmentedOption = { label: string; value: string; disabled?: boolean }

const searchModelOptions: SegmentedOption[] = [
  { label: '本地 v1', value: 'local_v1' },
  { label: '云端 v1', value: 'cloud_v1' },
  { label: '云端 v2（即将上线）', value: 'cloud_v2', disabled: true },
]

const viewModeOptions: SegmentedOption[] = [
  { label: '全部对话', value: 'timeline' },
  { label: '搜索结果', value: 'search' },
]

function onModelChange(val: string | number | boolean) {
  const m = val as SearchModel
  if (m === 'cloud_v2' || m === searchModelStore.model) return
  if (m === 'cloud_v1' && !auth.cloudSyncEnabled) {
    ElMessage.warning('请先在个人中心开启云端存储开关')
    searchModelStore.setModel('local_v1')
    return
  }
  searchModelStore.setModel(m)
}

function onModeChange(val: string | number | boolean) {
  const m = val as 'timeline' | 'search'
  if (m === 'search' && !query.value.trim()) {
    ElMessage.info('请输入搜索词后再切换到搜索模式')
    return
  }
  mode.value = m
}

// ═══════════ 过滤 / 正则 ═══════════
function toggleAiFilter(id: string) {
  activeAiFilter.value = activeAiFilter.value === id ? null : id
  void doSearch()
}

function onFilterChange(key: keyof SearchFilters, checked: boolean) {
  searchFilters.value[key] = checked
  if (query.value.trim()) void doSearch()
}

function onRegexChange() {
  if (query.value.trim()) void doSearch()
}

// ═══════════ Git 增量推送（已导入对话 → 远端仓库，单对话一个 commit） ═══════════
const gitSyncingConv = ref<string | null>(null)
const conflictVisible = ref(false)
const conflictCtx = ref<GitSyncContext | null>(null)
const conflictResolving = ref(false)
const conflictContainerName = ref('')

async function pushIncremental(item: SearchListItem) {
  const conv = item.conv
  if (gitSyncingConv.value) return
  gitSyncingConv.value = conv.deepseekConvId
  try {
    // 1. 补全数据：云端 lite 会话按需加载详情（含 rawMapping）；本地会话自带
    let full = conv
    if (full.messages.length === 0 && full.configId != null) {
      const detail = await loadConversationDetail(full.configId, full.deepseekConvId)
      full = { ...conv, messages: detail.messages, turns: detail.turns, mapping: detail.mapping }
    }
    // 2. 定位对话容器（云端 conv 带 configId；本地 conv 按 deepseekUserId 匹配云端容器）
    let configId = full.configId ?? null
    let localMode = false
    const localUid = (full as unknown as { deepseekUserId?: string }).deepseekUserId
    if (configId == null) {
      const res: any = await request.get('/configs')
      const configs = (res.configs ?? []) as Array<{ id: number; name: string; deepseekUserId: string }>
      const matched = localUid ? configs.find((c) => c.deepseekUserId === localUid) : undefined
      if (!matched) {
        ElMessage.warning('该对话所属账号还没有云端对话容器，无法使用 Git 增量同步')
        return
      }
      configId = matched.id
      localMode = true
    }
    // 3. 鉴权准备（GitUsername / APIKey，首次使用时引导生成）
    const ready = await prepareGitSync(configId)
    ready.localMode = localMode
    // 4. 单对话增量推送（远端同文件有变更时进入冲突流程）
    const out = await syncSingleConversation({
      configId,
      containerName: ready.containerName,
      deepseekUserId: ready.deepseekUserId,
      repoUrl: ready.repoUrl,
      conversation: full,
      localMode,
      gitUsername: ready.gitUsername,
      apiKey: ready.apiKey,
    })
    if (out.status === 'conflicts') {
      conflictCtx.value = out.ctx
      conflictContainerName.value = ready.containerName
      conflictVisible.value = true
      return
    }
    if (out.status === 'up-to-date') {
      ElMessage.success('远端已是最新，无需增量推送')
    } else {
      ElMessage.success(`增量推送成功（${out.commit.slice(0, 7)}）`)
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || 'Git 增量同步失败')
  } finally {
    gitSyncingConv.value = null
  }
}

async function onConflictResolve(resolutions: Record<string, ConflictResolution>) {
  if (!conflictCtx.value) return
  conflictResolving.value = true
  try {
    const out = await resolveConflicts(conflictCtx.value, resolutions)
    conflictVisible.value = false
    if (out.status === 'pushed') ElMessage.success(`冲突已解决并推送（${out.commit.slice(0, 7)}）`)
    if (out.status === 'up-to-date') ElMessage.success('已处理，远端与本地一致')
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || 'Git 推送失败')
  } finally {
    conflictResolving.value = false
    conflictCtx.value = null
  }
}

// ═══════════ 选中会话（云端 lite 按需加载详情） ═══════════
async function selectConversation(item: SearchListItem) {
  const conv = item.conv
  activeConv.value = conv
  if (isMobile.value) showDetail.value = true
  if (!conv.configId || conv.messages.length > 0) return
  detailLoading.value = true
  try {
    const { messages, turns } = await loadConversationDetail(conv.configId, conv.deepseekConvId)
    conv.messages = messages
    conv.turns = turns
    const idx = conversations.value.findIndex((c) => c.deepseekConvId === conv.deepseekConvId)
    if (idx >= 0) {
      const updated = { ...conv, messages, turns }
      conversations.value = [
        ...conversations.value.slice(0, idx),
        updated,
        ...conversations.value.slice(idx + 1),
      ]
      activeConv.value = updated
    }
  } catch (e) {
    console.warn('Failed to load conversation detail:', e)
    ElMessage.error('加载对话详情失败')
  } finally {
    detailLoading.value = false
  }
}

// ═══════════ 初始化（云端 / 本地） ═══════════
async function init() {
  loading.value = true
  loadTime.value = null
  const t0 = performance.now()
  try {
    if (auth.cloudSyncEnabled) {
      loadProgress.value = '正在获取配置列表…'
      const { configs } = (await request.get('/configs')) as any
      cloudConfigStates.value = configs.map((c: any) => ({
        id: c.id, name: c.name, page: 0, hasMore: true,
      }))
      const all: ParsedConversation[] = []
      for (let i = 0; i < configs.length; i++) {
        const cfg = configs[i]
        loadProgress.value = `正在加载配置 ${i + 1}/${configs.length}: ${cfg.name}…`
        try {
          const page = await loadConversationsPage({
            cloudSync: true, configId: cfg.id, page: 1,
            pageSize: EXPLORE_PAGE_SIZE, withMessages: false,
          })
          all.push(...page.conversations)
          const st = cloudConfigStates.value.find((s) => s.id === cfg.id)
          if (st) { st.page = 1; st.hasMore = page.hasMore }
          conversations.value = [...all]
          if (page.total != null) totalConvs.value = (totalConvs.value ?? 0) + page.total
        } catch (e) {
          console.warn(`Failed to load config ${cfg.name}:`, e)
          loadProgress.value = `配置 ${cfg.name} 加载失败`
        }
      }
      hasMore.value = cloudConfigStates.value.some((s) => s.hasMore)
    } else {
      loadProgress.value = '正在加载本地会话数据…'
      const page = await loadConversationsPage({
        cloudSync: false, page: 1, pageSize: EXPLORE_PAGE_SIZE,
      })
      conversations.value = page.conversations
      localPage.value = 1
      hasMore.value = page.hasMore
      if (page.total != null) totalConvs.value = page.total
      loadProgress.value = '正在读取本地配置…'
      const configs = await getLocalConfigs()
      const first = configs[0]
      if (first) {
        localUserId.value = first.deepseekUserId
        loadProgress.value = '正在预构建搜索索引…'
        void ensureIndexReady().catch(() => {})
      }
    }
    loadProgress.value = '正在加载 API Key 列表…'
    try {
      const { apiKeys: keys } = (await request.get('/apikeys')) as any
      apiKeys.value = keys
    } catch {
      /* 获取失败时右侧进入只读查看模式 */
    }
    loadTime.value = Math.round(performance.now() - t0)
  } finally {
    loading.value = false
    loadProgress.value = ''
  }
}

// ═══════════ 加载更多（云端按配置翻页 / 本地游标翻页） ═══════════
async function loadMore() {
  if (loadingMore.value || !hasMore.value || mode.value === 'search') return
  loadingMore.value = true
  try {
    if (auth.cloudSyncEnabled) {
      const toLoad = cloudConfigStates.value.filter((s) => s.hasMore)
      const more: ParsedConversation[] = []
      for (const s of toLoad) {
        const nextPage = s.page + 1
        const page = await loadConversationsPage({
          cloudSync: true, configId: s.id, page: nextPage,
          pageSize: EXPLORE_PAGE_SIZE, withMessages: false,
        })
        more.push(...page.conversations)
        s.page = nextPage
        s.hasMore = page.hasMore
      }
      if (more.length > 0) conversations.value = [...conversations.value, ...more]
      hasMore.value = cloudConfigStates.value.some((s) => s.hasMore)
    } else {
      const nextPage = localPage.value + 1
      const page = await loadConversationsPage({
        cloudSync: false, page: nextPage, pageSize: EXPLORE_PAGE_SIZE,
      })
      conversations.value = [...conversations.value, ...page.conversations]
      localPage.value = nextPage
      hasMore.value = page.hasMore
    }
  } catch (e) {
    console.warn('Failed to load more conversations:', e)
    ElMessage.error('加载更多失败，请重试')
  } finally {
    loadingMore.value = false
  }
}

// ═══════════ AI 智能过滤（仅云端） ═══════════
async function loadAiFilters() {
  try {
    const res = (await request.get('/search/filters')) as any
    aiFilters.value = res.filters || []
  } catch {
    /* 静默失败 */
  }
}

// ═══════════ 列表项展示辅助 ═══════════
function convDate(conv: ParsedConversation): string {
  return dayjs(conv.insertedAt).format('YYYY-MM-DD')
}

function turnCount(conv: ParsedConversation): number {
  return conv.turns?.length ?? conv.turnCount ?? 0
}

function roleLabel(role: string): string {
  if (role === 'USER') return '用户'
  if (role === 'TITLE') return '标题'
  return 'AI'
}

function roleTagType(role: string): 'primary' | 'success' | 'info' {
  if (role === 'USER') return 'primary'
  if (role === 'TITLE') return 'info'
  return 'success'
}

onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
  searchModelStore.syncFromAuth()
  void init()
  if (auth.cloudSyncEnabled) {
    void loadAiFilters()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
  clearSearchDebounce()
})
</script>

<template>
  <div class="explore-page">
    <!-- ══════════ 顶部状态栏 ══════════ -->
    <div class="explore-status">
      <template v-if="loading">
        <el-icon class="is-loading"><Refresh /></el-icon>
        <span>{{ loadProgress || '加载中…' }}</span>
      </template>
      <template v-else-if="loadTime !== null">
        <el-icon class="status-ok"><MagicStick /></el-icon>
        <span>就绪 · 加载耗时 {{ (loadTime / 1000).toFixed(2) }}s</span>
      </template>
      <div class="status-spacer" />
      <el-tag v-if="totalConvs != null || conversations.length > 0" size="small" effect="plain" round>
        {{ conversations.length }}<template v-if="totalConvs != null"> / {{ totalConvs }}</template> 个对话
      </el-tag>
      <el-tag size="small" :type="auth.cloudSyncEnabled ? 'success' : 'info'" effect="plain" round>
        {{ auth.cloudSyncEnabled ? '云端模式' : '本地模式' }}
      </el-tag>
    </div>

    <!-- ══════════ 搜索控制面板 ══════════ -->
    <el-card shadow="never" class="search-panel">
      <div class="search-row">
        <el-autocomplete
          v-model="query"
          class="search-input"
          :fetch-suggestions="fetchSuggestions"
          :trigger-on-focus="false"
          :debounce="300"
          value-key="value"
          clearable
          placeholder="输入关键词，搜索历史对话内容…（支持正则表达式）"
          @input="onQueryInput"
          @clear="onQueryClear"
          @select="onSuggestionSelect"
          @keyup.enter="onSearchEnter"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
          <template #default="{ item }">
            <div class="suggestion-item">
              <el-icon :size="14" class="suggestion-icon">
                <component :is="item.type === 'history' ? Timer : Search" />
              </el-icon>
              <span class="suggestion-text">{{ item.text }}</span>
              <el-tag size="small" effect="plain" round>{{ suggestionTypeLabel(item.type) }}</el-tag>
            </div>
          </template>
        </el-autocomplete>
        <div class="regex-toggle">
          <span class="opt-label">正则</span>
          <el-switch v-model="useRegex" @change="onRegexChange" />
        </div>
        <el-button type="primary" plain :loading="loading" :icon="Search" @click="doSearch">
          搜索
        </el-button>
      </div>

      <div class="options-row">
        <div class="opt-group">
          <span class="opt-label">搜索模式</span>
          <el-segmented
            :model-value="searchModelStore.model"
            :options="searchModelOptions"
            size="small"
            @change="onModelChange"
          />
        </div>
        <div class="opt-group">
          <span class="opt-label">视图</span>
          <el-segmented
            :model-value="mode"
            :options="viewModeOptions"
            size="small"
            @change="onModeChange"
          />
        </div>
      </div>

      <div v-if="auth.cloudSyncEnabled && aiFilters.length > 0" class="filter-row">
        <span class="opt-label">
          <el-icon><MagicStick /></el-icon>
          AI 智能过滤
        </span>
        <el-check-tag
          v-for="f in aiFilters"
          :key="f.id"
          :checked="activeAiFilter === f.id"
          @change="toggleAiFilter(f.id)"
        >
          {{ f.label }}
        </el-check-tag>
      </div>

      <div class="filter-row">
        <span class="opt-label">
          <el-icon><Filter /></el-icon>
          筛选范围
        </span>
        <el-check-tag :checked="searchFilters.title" @change="(v: boolean) => onFilterChange('title', v)">
          会话标题
        </el-check-tag>
        <el-check-tag :checked="searchFilters.user" @change="(v: boolean) => onFilterChange('user', v)">
          用户消息
        </el-check-tag>
        <el-check-tag :checked="searchFilters.assistant" @change="(v: boolean) => onFilterChange('assistant', v)">
          模型回复
        </el-check-tag>
      </div>
    </el-card>

    <!-- ══════════ 主分栏：会话列表 + ChatViewer ══════════ -->
    <div class="explore-layout">
      <el-card
        shadow="never"
        class="list-panel"
        :class="{ 'mobile-hide': isMobile && showDetail }"
      >
        <template #header>
          <div class="list-header">
            <span class="list-title">
              {{ mode === 'timeline' ? '全部对话' : `搜索结果（${searchResults.length}）` }}
            </span>
            <span class="list-meta">
              {{ conversations.length }}<template v-if="totalConvs != null"> / {{ totalConvs }}</template> 条
            </span>
          </div>
        </template>
        <div v-loading="loading" class="list-body">
          <template v-if="displayList.length > 0">
            <div
              v-for="item in displayList"
              :key="item.conv.deepseekConvId"
              class="conv-item"
              :class="{ active: activeConv?.deepseekConvId === item.conv.deepseekConvId }"
              @click="selectConversation(item)"
            >
              <div class="conv-title">{{ item.conv.title }}</div>
              <div class="conv-meta">
                <el-tag size="small" effect="plain" round>{{ convDate(item.conv) }}</el-tag>
                <el-tag size="small" effect="plain" round type="info">
                  {{ turnCount(item.conv) }} 轮
                </el-tag>
                <el-tag
                  v-if="mode === 'search' && item.role"
                  size="small"
                  effect="light"
                  round
                  :type="roleTagType(item.role)"
                >
                  {{ roleLabel(item.role) }}
                </el-tag>
                <el-tooltip content="将此对话以 Git 增量提交推送到远端仓库" placement="top">
                  <el-button
                    class="conv-git-btn"
                    size="small"
                    link
                    type="success"
                    :loading="gitSyncingConv === item.conv.deepseekConvId"
                    @click.stop="pushIncremental(item)"
                  >
                    <el-icon :size="13" style="margin-right: 2px;"><Share /></el-icon>
                    增量
                  </el-button>
                </el-tooltip>
              </div>
              <div v-if="mode === 'search' && item.snippet" class="conv-snippet">
                {{ item.snippet }}
              </div>
            </div>
            <div v-if="mode === 'timeline' && hasMore" class="load-more-row">
              <el-button
                type="primary"
                plain
                :loading="loadingMore"
                :icon="ArrowDown"
                @click="loadMore"
              >
                加载更多
              </el-button>
            </div>
          </template>
          <div v-else-if="!loading" class="list-empty">
            <el-empty :description="mode === 'search' ? '没有匹配的搜索结果' : '暂无会话数据'" />
          </div>
          <div v-if="mode === 'search' && unmatchedCloudCount > 0" class="unmatched-hint">
            另有 {{ unmatchedCloudCount }} 个匹配会话尚未加载到列表
          </div>
        </div>
      </el-card>

      <div
        v-loading="detailLoading"
        element-loading-text="正在加载对话详情…"
        class="viewer-panel"
        :class="{ 'mobile-show': isMobile && showDetail }"
      >
        <div v-if="isMobile && showDetail" class="mobile-bar">
          <el-button size="small" :icon="DArrowLeft" @click="showDetail = false">
            返回列表
          </el-button>
          <span class="mobile-bar-title">{{ activeConv?.title || '对话详情' }}</span>
        </div>
        <ChatViewer :conversation="activeConv" :api-keys="apiKeys" />
      </div>
    </div>

    <!-- Git 冲突处理对话框 -->
    <GitConflictDialog
      v-model:visible="conflictVisible"
      :conflicts="conflictCtx?.conflicts ?? []"
      :container-name="conflictContainerName"
      :resolving="conflictResolving"
      @resolve="onConflictResolve"
      @cancel="conflictVisible = false"
    />
  </div>
</template>

<style scoped>
/* ══════════ 页面骨架 ══════════ */
.explore-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 100px); /* 60px 顶栏 + 40px el-main 上下内边距 */
  height: calc(100dvh - 100px);
  min-height: 520px;
}

/* ══════════ 顶部状态栏 ══════════ */
.explore-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.status-ok {
  color: var(--el-color-success);
}
.status-spacer {
  flex: 1;
}

/* ══════════ 搜索面板 ══════════ */
.search-panel {
  flex-shrink: 0;
}
.search-panel :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 240px;
}
.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.suggestion-icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.suggestion-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.regex-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
.options-row {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.opt-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.opt-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

/* ══════════ 主分栏 ══════════ */
.explore-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

/* 左：会话列表 */
.list-panel {
  width: 400px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-panel :deep(.el-card__header) {
  flex-shrink: 0;
  padding: 12px 16px;
}
.list-panel :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.list-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.list-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.conv-item {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}
.conv-item:hover {
  background: var(--el-fill-color-light);
}
.conv-item.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.conv-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.conv-git-btn {
  margin-left: auto;
  font-size: 12px;
  padding: 2px 4px;
}
.conv-snippet {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.load-more-row {
  display: flex;
  justify-content: center;
  padding: 10px 0 6px;
}
.list-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.unmatched-hint {
  flex-shrink: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 右：ChatViewer */
.viewer-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
}
.mobile-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.mobile-bar-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ══════════ 窄屏：列表/详情二选一 ══════════ */
@media (max-width: 820px) {
  .explore-layout {
    flex-direction: column;
  }
  .list-panel {
    width: 100%;
    flex: 1;
  }
  .list-panel.mobile-hide {
    display: none;
  }
  .viewer-panel {
    display: none;
  }
  .viewer-panel.mobile-show {
    display: flex;
  }
  .options-row {
    gap: 12px;
  }
}
</style>
