<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { loadConversationsPage } from '@/utils/db'
import { request } from '@/utils/request'
import { toAlpacaSingle, toAlpacaMulti, downloadJSON } from '@/utils/alpaca'
import type { ParsedConversation } from '@/types'

const auth = useAuthStore()
const loading = ref(false)
const convs = ref<ParsedConversation[]>([])
const selected = ref<string[]>([])
const multiTurn = ref(false)

// ===== 云端配置选择（0 = 全部配置） =====
const cloudConfigs = ref<Array<{ id: number; name: string }>>([])
const configFilter = ref<number>(0)

const ALPACA_PAGE_SIZE = 20
const hasMore = ref(false)
const loadingMore = ref(false)
const totalConvs = ref<number | undefined>(undefined)
const cloudConfigStates = ref<Array<{ id: number; page: number; hasMore: boolean }>>([])
const localPage = ref(1)

// ===== 加载进度（云端多配置逐个分页加载） =====
const loadProgress = ref('')
const loadPercent = ref(0)

/** 根据 configFilter 计算本次要加载的云端配置列表 */
function pickTargets(): Array<{ id: number; name: string }> {
  const list = cloudConfigs.value
  if (configFilter.value === 0) return list
  const hit = list.find((c) => c.id === configFilter.value)
  return hit ? [hit] : []
}

async function load(): Promise<void> {
  loading.value = true
  loadProgress.value = ''
  loadPercent.value = 0
  try {
    selected.value = []
    totalConvs.value = undefined
    if (auth.cloudSyncEnabled) {
      const { configs } = (await request.get('/configs')) as any
      cloudConfigs.value = ((configs ?? []) as Array<{ id: number | null; name: string }>)
        .flatMap((c) => (c.id == null ? [] : [{ id: c.id, name: c.name }]))
      const targets = pickTargets()
      cloudConfigStates.value = targets.map((c) => ({ id: c.id, page: 0, hasMore: true }))
      const all: ParsedConversation[] = []
      for (let i = 0; i < targets.length; i++) {
        const cfg = targets[i]
        if (!cfg) continue
        loadProgress.value = `正在加载 ${cfg.name}（${i + 1}/${targets.length}）…`
        loadPercent.value = targets.length > 1 ? Math.round((i / targets.length) * 100) : 0
        const page = await loadConversationsPage({
          cloudSync: true,
          configId: cfg.id,
          page: 1,
          pageSize: ALPACA_PAGE_SIZE,
          withMessages: true,
        })
        all.push(...page.conversations)
        const st = cloudConfigStates.value.find((s) => s.id === cfg.id)
        if (st) {
          st.page = 1
          st.hasMore = page.hasMore
        }
        if (page.total != null) totalConvs.value = (totalConvs.value ?? 0) + page.total
      }
      convs.value = all
      hasMore.value = cloudConfigStates.value.some((s) => s.hasMore)
      loadPercent.value = 100
    } else {
      localPage.value = 1
      const page = await loadConversationsPage({
        cloudSync: false,
        page: 1,
        pageSize: ALPACA_PAGE_SIZE,
        withMessages: true,
      })
      convs.value = page.conversations
      hasMore.value = page.hasMore
      totalConvs.value = page.total
    }
  } finally {
    loading.value = false
    loadProgress.value = ''
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    if (auth.cloudSyncEnabled) {
      const toLoad = cloudConfigStates.value.filter((s) => s.hasMore)
      const more: ParsedConversation[] = []
      for (const s of toLoad) {
        const nextPage = s.page + 1
        const page = await loadConversationsPage({
          cloudSync: true,
          configId: s.id,
          page: nextPage,
          pageSize: ALPACA_PAGE_SIZE,
          withMessages: true,
        })
        more.push(...page.conversations)
        s.page = nextPage
        s.hasMore = page.hasMore
      }
      if (more.length > 0) convs.value = [...convs.value, ...more]
      hasMore.value = cloudConfigStates.value.some((s) => s.hasMore)
    } else {
      const nextPage = localPage.value + 1
      const page = await loadConversationsPage({
        cloudSync: false,
        page: nextPage,
        pageSize: ALPACA_PAGE_SIZE,
        withMessages: true,
      })
      if (page.conversations.length > 0) {
        convs.value = [...convs.value, ...page.conversations]
      }
      localPage.value = nextPage
      hasMore.value = page.hasMore
    }
  } finally {
    loadingMore.value = false
  }
}

const selectedConvs = computed<ParsedConversation[]>(() =>
  convs.value.filter((c) => selected.value.includes(c.deepseekConvId)),
)
const convertedAll = computed<any[]>(() => {
  const c = selectedConvs.value
  return multiTurn.value ? toAlpacaMulti(c) : toAlpacaSingle(c)
})
const preview = computed<any[]>(() => convertedAll.value.slice(0, 2))
const total = computed<number>(() => convertedAll.value.length)

function selectAll(): void {
  selected.value = convs.value.map((c) => c.deepseekConvId)
}
function clearAll(): void {
  selected.value = []
}
function download(): void {
  if (total.value === 0) return
  downloadJSON(convertedAll.value, `alpaca-${Date.now()}.json`)
  ElMessage.success(`已导出 ${total.value} 条 Alpaca 数据`)
}

function onConfigChange(): void {
  if (auth.cloudSyncEnabled) void load()
}

onMounted(load)
</script>

<template>
  <div class="alpaca-page">
    <!-- 顶部工具条 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-title">
        <h2>Alpaca 数据格式转换</h2>
        <p class="toolbar-sub">将你的对话数据导出为业界标准的 Alpaca 格式，可直接用于模型微调训练</p>
      </div>

      <div class="toolbar-actions">
        <el-radio-group v-model="multiTurn">
          <el-radio-button :value="false">单轮问答</el-radio-button>
          <el-radio-button :value="true">多轮对话</el-radio-button>
        </el-radio-group>

        <el-select
          v-if="auth.cloudSyncEnabled"
          v-model="configFilter"
          class="config-select"
          placeholder="选择配置"
          @change="onConfigChange"
        >
          <el-option label="全部配置" :value="0" />
          <el-option
            v-for="c in cloudConfigs"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>

        <el-button @click="selectAll">
          <el-icon style="margin-right: 4px;"><CircleCheck /></el-icon>
          全选
        </el-button>
        <el-button @click="clearAll">
          <el-icon style="margin-right: 4px;"><CircleClose /></el-icon>
          清空
        </el-button>

        <div class="spacer" />

        <el-tag type="info" effect="plain">
          已选 {{ selected.length }} / {{ convs.length }} 个会话
          <template v-if="totalConvs != null">（共 {{ totalConvs }}）</template>
        </el-tag>
        <el-tag :type="total > 0 ? 'success' : 'info'" effect="plain">
          将生成 {{ total }} 条
        </el-tag>
        <el-button type="primary" :disabled="!total" @click="download">
          <el-icon style="margin-right: 4px;"><Download /></el-icon>
          下载 JSON
        </el-button>
      </div>

      <el-progress
        v-if="loading && loadProgress"
        :percentage="loadPercent"
        :stroke-width="8"
        striped
        striped-flow
        class="load-progress"
      />
      <div v-if="loading && loadProgress" class="load-progress-text">{{ loadProgress }}</div>
    </el-card>

    <!-- 空状态 -->
    <el-card v-if="!loading && convs.length === 0" shadow="never">
      <el-empty description="暂无会话，请先在配置页上传" :image-size="90" />
    </el-card>

    <!-- 会话列表 + 数据预览 -->
    <div v-else class="content-grid" v-loading="loading">
      <el-card shadow="never" class="conv-card">
        <template #header>
          <div class="card-head">
            <el-icon :size="15" style="color: var(--el-color-primary);"><Menu /></el-icon>
            <span>会话列表</span>
          </div>
        </template>
        <div class="conv-list">
          <el-checkbox-group v-model="selected" class="conv-group">
            <el-checkbox
              v-for="c in convs"
              :key="c.deepseekConvId"
              :value="c.deepseekConvId"
              class="conv-checkbox"
            >
              <span class="conv-title">{{ c.title }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <div v-if="hasMore" class="load-more">
            <el-button
              size="small"
              type="primary"
              plain
              :loading="loadingMore"
              @click="loadMore"
            >
              <template v-if="!loadingMore">
                <el-icon style="margin-right: 4px;"><ArrowDown /></el-icon>
              </template>
              加载更多（已加载 {{ convs.length }}<template v-if="totalConvs != null"> / {{ totalConvs }}</template>）
            </el-button>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="preview-card">
        <template #header>
          <div class="card-head">
            <el-icon :size="15" style="color: var(--el-color-primary);"><View /></el-icon>
            <span>数据预览</span>
            <el-tag size="small" type="info" effect="plain" class="preview-count-tag">
              前 {{ preview.length }} 条
            </el-tag>
            <div class="spacer" />
            <el-tag v-if="total > 0" size="small" type="primary" effect="plain">
              共 {{ total }} 条数据待导出
            </el-tag>
          </div>
        </template>
        <el-empty v-if="preview.length === 0" description="选择会话后预览转换结果" />
        <div v-else class="preview-list">
          <div v-for="(item, i) in preview" :key="i" class="preview-item">
            <div class="preview-label">第 {{ i + 1 }} 条</div>
            <pre class="preview-pre"><code>{{ JSON.stringify(item, null, 2) }}</code></pre>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.toolbar-card {
  margin-bottom: 16px;
}
.toolbar-title h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--el-text-color-primary);
}
.toolbar-sub {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.config-select {
  width: 220px;
}
.spacer {
  flex: 1;
}
.load-progress {
  margin-top: 14px;
}
.load-progress-text {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.content-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.conv-list {
  max-height: 62vh;
  overflow-y: auto;
}
.conv-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.conv-checkbox {
  margin-right: 0;
  height: auto;
  padding: 6px 8px;
  border-radius: 6px;
}
.conv-checkbox:hover {
  background: var(--el-fill-color-light);
}
.conv-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
  display: inline-block;
  vertical-align: middle;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 14px 0 4px;
}
.preview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 62vh;
  overflow-y: auto;
}
.preview-item {
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.preview-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.preview-pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-regular);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-x: auto;
}
.preview-pre code {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
  line-height: inherit;
  white-space: pre;
}
.preview-count-tag {
  margin-left: 4px;
}
</style>
