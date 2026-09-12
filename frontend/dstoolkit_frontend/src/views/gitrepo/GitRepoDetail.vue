<script setup lang="ts">
/**
 * GitRepoDetail.vue
 * 仓库详情：展示仓库元信息 + 拆分存储后的对话列表 + 该仓库相关的任务进度。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Folder, Refresh, ChatDotRound } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { useTaskQueueStore, type TaskRecord } from '@/stores/taskQueue'

const route = useRoute()
const taskStore = useTaskQueueStore()

const repoId = computed(() => Number(route.params.id))

interface RepoDetail {
  id: number
  name: string
  repoFsName: string
  description: string | null
  status: string
  conversationCount: number
  lastPushAt: string | null
  createdAt: string
  conversations: Array<{ convId: string; title: string; turnCount: number; turns: number }>
}

const repo = ref<RepoDetail | null>(null)
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = (await request.get(`/git-repos/${repoId.value}`)) as RepoDetail
    repo.value = res
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

const repoTasks = computed<TaskRecord[]>(() =>
  taskStore.sortedTasks.filter((t) => t.gitRepoId === repoId.value),
)

function formatDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString()
}

function statusLabel(status: string): string {
  switch (status) {
    case 'empty':
      return '空仓库'
    case 'active':
      return '已推送'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

function taskStatusLabel(s: TaskRecord['status']): string {
  switch (s) {
    case 'pending':
      return '等待中'
    case 'processing':
      return '执行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return s
  }
}

function taskStatusType(s: TaskRecord['status']): 'info' | 'warning' | 'success' | 'danger' {
  switch (s) {
    case 'pending':
      return 'info'
    case 'processing':
      return 'warning'
    case 'done':
      return 'success'
    case 'failed':
      return 'danger'
  }
}

onMounted(async () => {
  await load()
  await taskStore.refreshTasks()
})
</script>

<template>
  <div v-loading="loading" class="repo-detail-page">
    <el-card v-if="repo" shadow="never" class="head-card">
      <div class="head-row">
        <el-icon :size="28" class="head-icon"><Folder /></el-icon>
        <div class="head-title-block">
          <h2>{{ repo.name }}</h2>
          <div class="head-meta">
            <el-tag size="small" effect="plain">{{ statusLabel(repo.status) }}</el-tag>
            <span>对话数：<b>{{ repo.conversationCount }}</b></span>
            <span>文件名：<code>{{ repo.repoFsName }}</code></span>
            <span>最近推送：{{ formatDate(repo.lastPushAt) }}</span>
          </div>
          <div v-if="repo.description" class="head-desc">{{ repo.description }}</div>
        </div>
        <div class="head-spacer" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>
    </el-card>

    <el-card v-if="repo" shadow="never">
      <template #header>
        <div class="card-head">
          <el-icon :size="15" style="color: var(--el-color-primary);"><ChatDotRound /></el-icon>
          <span>对话记录（按轮次拆分存储）</span>
          <el-tag size="small" type="info" effect="plain">{{ repo.conversations.length }} 个</el-tag>
        </div>
      </template>
      <el-empty v-if="repo.conversations.length === 0" description="仓库为空，请先上传对话记录压缩包" />
      <el-table v-else :data="repo.conversations" stripe>
        <el-table-column label="对话ID" prop="convId" width="320" />
        <el-table-column label="标题" prop="title" min-width="200" />
        <el-table-column label="meta 轮次数" prop="turnCount" width="120" />
        <el-table-column label="实际 turn 文件" prop="turns" width="140" />
      </el-table>
    </el-card>

    <el-card v-if="repo" shadow="never">
      <template #header>
        <div class="card-head">
          <el-icon :size="15" style="color: var(--el-color-primary);"><Refresh /></el-icon>
          <span>该仓库的任务进度</span>
        </div>
      </template>
      <el-empty v-if="repoTasks.length === 0" description="暂无任务" />
      <div v-else class="task-list">
        <div v-for="t in repoTasks" :key="t.id" class="task-item">
          <div class="task-row">
            <el-tag :type="taskStatusType(t.status)" size="small" effect="dark">
              {{ taskStatusLabel(t.status) }}
            </el-tag>
            <span class="task-id">#{{ t.id }}</span>
            <span class="task-type">{{ t.type }}</span>
            <span class="task-time">{{ formatDate(t.createdAt) }}</span>
          </div>
          <div class="task-msg">{{ t.message || '—' }}</div>
          <el-progress
            v-if="t.status === 'processing' || t.status === 'pending'"
            :percentage="t.progress || 0"
            :stroke-width="8"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.repo-detail-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head-card :deep(.el-card__body) {
  padding: 16px 20px;
}
.head-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.head-icon {
  color: var(--el-color-primary);
  margin-top: 4px;
}
.head-title-block {
  min-width: 0;
  flex: 1;
}
.head-title-block h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: var(--el-text-color-primary);
}
.head-meta {
  display: flex;
  gap: 12px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
  align-items: center;
}
.head-meta b {
  color: var(--el-text-color-primary);
}
.head-meta code {
  background: var(--el-fill-color-light);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11.5px;
}
.head-desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.head-spacer {
  flex: 1;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
.task-id {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.task-type {
  flex: 1;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.task-time {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.task-msg {
  margin: 6px 0;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
</style>
