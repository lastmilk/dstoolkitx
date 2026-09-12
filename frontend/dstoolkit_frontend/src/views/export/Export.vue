<script setup lang="ts">
/**
 * Export.vue（取代旧版 Alpaca 单一导出）
 *
 * 多样化可视化导出：JSON / CSV / Markdown / HTML / Alpaca(单轮|多轮)。
 *  - 云端模式：调用后端 /api/export/* 接口预览 + 下载（支持所有格式）
 *  - 本地模式：仅支持 JSON / Alpaca 单轮|多轮（基于本地数据客户端转换）
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Files, View, MagicStick, Document, DataLine, Histogram } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { request } from '@/utils/request'
import { loadConversationsPage } from '@/utils/db'
import {
  toAlpacaSingle, toAlpacaMulti, downloadJSON,
} from '@/utils/alpaca'
import type { ParsedConversation } from '@/types'

const auth = useAuthStore()

// ===== 后端支持的格式 =====
interface ExportFormatItem {
  id: string
  name: string
  desc: string
  ext: string
}
const formats = ref<ExportFormatItem[]>([])
const format = ref<string>('alpaca-single')

// ===== 配置选择 =====
const cloudConfigs = ref<Array<{ id: number; name: string }>>([])
const configFilter = ref<number>(0)

// ===== 会话列表 + 选择 =====
const loading = ref(false)
const convs = ref<ParsedConversation[]>([])
const selected = ref<string[]>([])
const totalConvs = ref<number | undefined>(undefined)
const PAGE_SIZE = 20
const localPage = ref(1)
const hasMore = ref(false)

// ===== 预览 =====
const previewContent = ref('')
const previewLoading = ref(false)

const selectedConvs = computed(() =>
  convs.value.filter((c) => selected.value.includes(c.deepseekConvId)),
)

function isCloud(): boolean {
  return auth.cloudSyncEnabled
}

function pickTargets(): Array<{ id: number; name: string }> {
  if (configFilter.value === 0) return cloudConfigs.value
  const hit = cloudConfigs.value.find((c) => c.id === configFilter.value)
  return hit ? [hit] : []
}

async function loadFormats(): Promise<void> {
  try {
    const res = (await request.get('/export/formats')) as { formats: ExportFormatItem[] }
    formats.value = res.formats ?? []
  } catch {
    /* 静默 */
  }
}

async function loadConfigs(): Promise<void> {
  if (!isCloud()) return
  const { configs } = (await request.get('/configs')) as any
  cloudConfigs.value = ((configs ?? []) as Array<{ id: number | null; name: string }>)
    .flatMap((c) => (c.id == null ? [] : [{ id: c.id, name: c.name }]))
}

async function load(): Promise<void> {
  loading.value = true
  selected.value = []
  totalConvs.value = undefined
  try {
    if (isCloud()) {
      const targets = pickTargets()
      const all: ParsedConversation[] = []
      let total: number | undefined
      for (const cfg of targets) {
        const page = await loadConversationsPage({
          cloudSync: true,
          configId: cfg.id,
          page: 1,
          pageSize: PAGE_SIZE,
          withMessages: false,
        })
        all.push(...page.conversations)
        if (page.total != null) total = (total ?? 0) + page.total
      }
      convs.value = all
      hasMore.value = convs.value.length >= PAGE_SIZE
      totalConvs.value = total
    } else {
      localPage.value = 1
      const page = await loadConversationsPage({
        cloudSync: false,
        page: 1,
        pageSize: PAGE_SIZE,
        withMessages: true,
      })
      convs.value = page.conversations
      hasMore.value = page.hasMore
      totalConvs.value = page.total
    }
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (!hasMore.value) return
  try {
    if (isCloud()) {
      // 简化：按 config 顺序翻页（与旧版一致）
      const more: ParsedConversation[] = []
      for (const cfg of pickTargets()) {
        const nextPage = Math.floor(convs.value.length / PAGE_SIZE) + 1
        const page = await loadConversationsPage({
          cloudSync: true,
          configId: cfg.id,
          page: nextPage,
          pageSize: PAGE_SIZE,
          withMessages: false,
        })
        more.push(...page.conversations)
      }
      if (more.length) convs.value = [...convs.value, ...more]
      hasMore.value = more.length >= PAGE_SIZE
    } else {
      const nextPage = localPage.value + 1
      const page = await loadConversationsPage({
        cloudSync: false,
        page: nextPage,
        pageSize: PAGE_SIZE,
        withMessages: true,
      })
      if (page.conversations.length) convs.value = [...convs.value, ...page.conversations]
      localPage.value = nextPage
      hasMore.value = page.hasMore
    }
  } catch {
    /* 静默 */
  }
}

function selectAll(): void {
  selected.value = convs.value.map((c) => c.deepseekConvId)
}
function clearAll(): void {
  selected.value = []
}

async function preview(): Promise<void> {
  if (selectedConvs.value.length === 0) {
    ElMessage.warning('请先选择会话')
    return
  }
  previewLoading.value = true
  try {
    if (isCloud() && configFilter.value) {
      const convIds = selectedConvs.value.map((c) => Number(c.id)).filter(Boolean)
      const res = (await request.post('/export/preview', {
        configId: configFilter.value,
        format: format.value,
        conversationIds: convIds.length ? convIds : undefined,
        limit: 2,
      })) as { content: string; totalCount: number; fileExt: string }
      previewContent.value = res.content || ''
    } else {
      // 本地模式：客户端转换预览
      const data = format.value === 'alpaca-multi'
        ? toAlpacaMulti(selectedConvs.value).slice(0, 2)
        : format.value === 'alpaca-single'
          ? toAlpacaSingle(selectedConvs.value).slice(0, 2)
          : selectedConvs.value.slice(0, 2)
      previewContent.value = JSON.stringify(data, null, 2)
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    previewLoading.value = false
  }
}

async function download(): Promise<void> {
  if (selectedConvs.value.length === 0) {
    ElMessage.warning('请先选择会话')
    return
  }
  if (isCloud() && configFilter.value) {
    const convIds = selectedConvs.value.map((c) => Number(c.id)).filter(Boolean)
    const params = new URLSearchParams({
      configId: String(configFilter.value),
      format: format.value,
    })
    if (convIds.length) {
      for (const id of convIds) params.append('conversationIds', String(id))
    }
    // 触发浏览器下载
    const token = localStorage.getItem('dstoolkit_token')
    const url = `/api/export/download?${params.toString()}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    // 后端校验 JWT via Authorization，无法走 anchor 下载，改用 fetch
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('下载失败')
      const blob = await res.blob()
      const disp = res.headers.get('Content-Disposition') || ''
      const m = /filename="([^"]+)"/.exec(disp)
      const filename = m?.[1] || `export-${format.value}-${Date.now()}`
      const u = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = u
      link.download = filename
      link.click()
      URL.revokeObjectURL(u)
      ElMessage.success('已开始下载')
    } catch {
      ElMessage.error('下载失败')
    }
    return
  }
  // 本地模式：仅支持 JSON / Alpaca 客户端导出
  const data = format.value === 'alpaca-multi'
    ? toAlpacaMulti(selectedConvs.value)
    : toAlpacaSingle(selectedConvs.value)
  downloadJSON(data, `export-${format.value}-${Date.now()}.json`)
  ElMessage.success(`已导出 ${selectedConvs.value.length} 个会话`)
}

function onConfigChange(): void {
  if (isCloud()) void load()
}

onMounted(async () => {
  await loadFormats()
  await loadConfigs()
  await load()
})
</script>

<template>
  <div class="export-page">
    <!-- 顶部工具条 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-title">
        <h2>对话记录导出</h2>
        <p class="toolbar-sub">
          多样化可视化导出：JSON · CSV · Markdown · HTML · Alpaca（单轮 / 多轮）。
          <el-tag v-if="!isCloud()" size="small" type="warning" effect="plain">本地模式</el-tag>
          <el-tag v-else size="small" type="success" effect="plain">云端模式</el-tag>
        </p>
      </div>

      <div class="toolbar-actions">
        <!-- 格式选择 -->
        <el-select v-model="format" class="format-select" placeholder="导出格式">
          <el-option
            v-for="f in formats"
            :key="f.id"
            :label="f.name"
            :value="f.id"
          >
            <span style="float: left">{{ f.name }}</span>
            <span class="format-desc">{{ f.desc }}</span>
          </el-option>
        </el-select>

        <!-- 配置选择（云端模式） -->
        <el-select
          v-if="isCloud()"
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
          <el-icon style="margin-right: 4px;"><Files /></el-icon>
          全选
        </el-button>
        <el-button @click="clearAll">
          <el-icon style="margin-right: 4px;"><View /></el-icon>
          清空
        </el-button>

        <div class="spacer" />

        <el-tag type="info" effect="plain">
          已选 {{ selected.length }} / {{ convs.length }}
          <template v-if="totalConvs != null">（共 {{ totalConvs }}）</template>
        </el-tag>
        <el-button type="primary" plain :loading="previewLoading" @click="preview">
          <el-icon style="margin-right: 4px;"><View /></el-icon>
          预览
        </el-button>
        <el-button type="primary" :disabled="!selected.length" @click="download">
          <el-icon style="margin-right: 4px;"><Download /></el-icon>
          下载
        </el-button>
      </div>
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
            <el-icon :size="15" style="color: var(--el-color-primary);"><Files /></el-icon>
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
            <el-button size="small" type="primary" plain @click="loadMore">
              <el-icon style="margin-right: 4px;"><View /></el-icon>
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
              格式：{{ format }}
            </el-tag>
          </div>
        </template>
        <el-empty v-if="!previewContent" description="选择会话后点击「预览」查看转换结果" />
        <div v-else class="preview-list">
          <pre class="preview-pre"><code>{{ previewContent }}</code></pre>
        </div>
      </el-card>
    </div>

    <!-- 格式卡片展示 -->
    <el-card v-if="formats.length" shadow="never" class="formats-card">
      <template #header>
        <div class="card-head">
          <el-icon :size="15" style="color: var(--el-color-primary);"><MagicStick /></el-icon>
          <span>支持的导出格式</span>
        </div>
      </template>
      <div class="formats-grid">
        <div
          v-for="f in formats"
          :key="f.id"
          class="format-card"
          :class="{ active: format === f.id }"
          @click="format = f.id"
        >
          <el-icon :size="20" class="format-icon">
            <Document v-if="f.id === 'json'" />
            <DataLine v-else-if="f.id === 'csv'" />
            <Files v-else-if="f.id === 'markdown' || f.id === 'html'" />
            <Histogram v-else />
          </el-icon>
          <div class="format-info">
            <div class="format-name">{{ f.name }}</div>
            <div class="format-text">{{ f.desc }}</div>
            <el-tag size="small" type="info" effect="plain">.{{ f.ext }}</el-tag>
          </div>
        </div>
      </div>
    </el-card>
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
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.format-select {
  width: 220px;
}
.config-select {
  width: 220px;
}
.format-desc {
  float: right;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.content-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
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
  max-height: 62vh;
  overflow-y: auto;
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
  white-space: pre-wrap;
  word-break: break-word;
}
.preview-count-tag {
  margin-left: 4px;
}
/* 格式卡片 */
.formats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.format-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--el-bg-color);
}
.format-card:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.format-card.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 2px 8px var(--el-color-primary-light-7);
}
.format-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.format-info {
  min-width: 0;
}
.format-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 2px;
}
.format-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
  line-height: 1.4;
}
</style>
