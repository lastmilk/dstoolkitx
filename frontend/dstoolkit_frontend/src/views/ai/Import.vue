<script setup lang="ts">
/**
 * AI 知识库 - 导入页
 *  - 分享链接增量导入（DeepSeek / ChatGPT）
 *  - JSON 全量导入（DeepSeek / OpenAI 统一 message 格式）
 *  - 已导入对话列表
 */
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Link, Upload, Document, Refresh } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import type { UnifiedConversation } from '@/types'

const loading = ref(false)
const shareUrl = ref('')
const shareLoading = ref(false)
const jsonFormat = ref<'deepseek' | 'openai'>('deepseek')
const jsonFile = ref<File | null>(null)
const jsonLoading = ref(false)

const conversations = ref<UnifiedConversation[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const SOURCE_LABELS: Record<string, string> = {
  DEEPSEEK_SHARE: 'DeepSeek 分享',
  OPENAI_SHARE: 'ChatGPT 分享',
  DEEPSEEK_JSON: 'DeepSeek JSON',
  OPENAI_JSON: 'OpenAI JSON',
  CONTINUED: '续聊',
  AGENT: 'Agent',
}

const SOURCE_TAGS: Record<string, string> = {
  DEEPSEEK_SHARE: 'success',
  OPENAI_SHARE: 'success',
  DEEPSEEK_JSON: '',
  OPENAI_JSON: '',
  CONTINUED: 'warning',
  AGENT: 'danger',
}

async function importByShare() {
  if (!shareUrl.value.trim()) {
    ElMessage.warning('请输入分享链接')
    return
  }
  shareLoading.value = true
  try {
    const res: any = await request.post('/import/share', { url: shareUrl.value.trim() })
    if (res.imported) {
      ElMessage.success(`导入成功：${res.conversation.title}`)
      shareUrl.value = ''
      loadConversations()
    } else {
      ElMessage.info(res.reason || '该对话已导入')
    }
  } catch {
    // 错误已由拦截器提示
  } finally {
    shareLoading.value = false
  }
}

function onFileChange(file: any) {
  jsonFile.value = file?.raw || null
}

async function importByJson() {
  if (!jsonFile.value) {
    ElMessage.warning('请选择 JSON 文件')
    return
  }
  jsonLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', jsonFile.value)
    formData.append('format', jsonFormat.value)
    const res: any = await request.post('/import/json', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    ElMessage.success(`成功导入 ${res.count} 段对话`)
    jsonFile.value = null
    loadConversations()
  } catch {
    // 错误已由拦截器提示
  } finally {
    jsonLoading.value = false
  }
}

async function loadConversations() {
  loading.value = true
  try {
    const res: any = await request.get('/import/conversations', {
      params: { page: page.value, pageSize },
    })
    conversations.value = res.conversations || []
    total.value = res.total || 0
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

onMounted(loadConversations)
</script>

<template>
  <div class="import-page">
    <!-- 导入方式 -->
    <el-row :gutter="20">
      <!-- 分享链接 -->
      <el-col :xs="24" :md="12">
        <el-card class="import-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <el-icon><Link /></el-icon>
              <span>分享链接导入（增量）</span>
            </div>
          </template>
          <p class="card-desc">粘贴 DeepSeek 或 ChatGPT 的对话分享链接，自动抓取并增量导入。</p>
          <el-input
            v-model="shareUrl"
            placeholder="https://chat.deepseek.com/..."
            size="large"
            clearable
            @keyup.enter="importByShare"
          >
            <template #prepend>链接</template>
          </el-input>
          <el-button
            type="primary"
            class="import-btn"
            :loading="shareLoading"
            @click="importByShare"
          >
            导入对话
          </el-button>
        </el-card>
      </el-col>

      <!-- JSON 全量 -->
      <el-col :xs="24" :md="12">
        <el-card class="import-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <el-icon><Document /></el-icon>
              <span>JSON 全量导入</span>
            </div>
          </template>
          <p class="card-desc">上传 DeepSeek 或 OpenAI 统一 message 格式的 JSON 文件，全量导入对话。</p>
          <el-radio-group v-model="jsonFormat" class="format-group">
            <el-radio value="deepseek">DeepSeek 格式</el-radio>
            <el-radio value="openai">OpenAI 格式</el-radio>
          </el-radio-group>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".json"
            :on-change="onFileChange"
          >
            <el-button>
              <el-icon><Upload /></el-icon>
              选择 JSON 文件
            </el-button>
          </el-upload>
          <div v-if="jsonFile" class="file-name">已选择：{{ jsonFile.name }}</div>
          <el-button
            type="primary"
            class="import-btn"
            :loading="jsonLoading"
            :disabled="!jsonFile"
            @click="importByJson"
          >
            开始导入
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <!-- 已导入对话列表 -->
    <el-card class="list-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>已导入对话（{{ total }}）</span>
          <el-button text :icon="Refresh" @click="loadConversations">刷新</el-button>
        </div>
      </template>
      <el-table :data="conversations" v-loading="loading" stripe>
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="来源" width="140">
          <template #default="{ row }">
            <el-tag :type="SOURCE_TAGS[row.source] as any" size="small">
              {{ SOURCE_LABELS[row.source] || row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="turnCount" label="轮次" width="80" align="center" />
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.updatedAt).toLocaleString() }}
          </template>
        </el-table-column>
      </el-table>
      <div v-if="total > pageSize" class="pagination">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="loadConversations"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.import-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.card-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0 0 16px;
}
.format-group {
  margin-bottom: 12px;
}
.file-name {
  margin: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.import-btn {
  margin-top: 12px;
  width: 100%;
}
.list-card :deep(.el-card__header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
@media (max-width: 768px) {
  .import-card {
    margin-bottom: 12px;
  }
}
</style>
