<script setup lang="ts">
/**
 * TaskNotification.vue
 * 任务队列通知任务栏：Deepseek Toolkit 右侧的小红点 + 下拉任务列表。
 *
 *  - 红点：仅当存在 pending/processing 任务时显示（store.hasActive）
 *  - 数字徽章：超过 1 个活跃任务时显示数量
 *  - 下拉面板：展开时高频拉取任务列表，展示等待中/执行中/完成/失败
 *  - 路由跳转：点击任务条目跳转至对应仓库详情或导出页
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { useTaskQueueStore, type TaskStatus } from '@/stores/taskQueue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const store = useTaskQueueStore()
const auth = useAuthStore()

const visible = computed(() => auth.isLoggedIn)
const badge = computed(() => (store.activeCount > 99 ? '99+' : String(store.activeCount)))

function statusMeta(status: TaskStatus): { label: string; type: 'info' | 'warning' | 'success' | 'danger' } {
  switch (status) {
    case 'pending':
      return { label: '等待中', type: 'info' }
    case 'processing':
      return { label: '执行中', type: 'warning' }
    case 'done':
      return { label: '已完成', type: 'success' }
    case 'failed':
      return { label: '失败', type: 'danger' }
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'ZIP_UPLOAD':
      return '上传对话记录'
    default:
      return type
  }
}

async function onVisibleChange(open: boolean) {
  await store.togglePanel(open)
}

function onTaskClick(task: { gitRepoId: number | null; type: string }) {
  store.togglePanel(false)
  if (task.gitRepoId) {
    router.push({ name: 'git-repo-detail', params: { id: String(task.gitRepoId) } })
  }
}

onMounted(() => {
  if (auth.isLoggedIn) store.startPolling()
})
onUnmounted(() => {
  store.stopPolling()
})
</script>

<template>
  <el-popover
    v-if="visible"
    placement="bottom-end"
    :width="360"
    trigger="click"
    @show="onVisibleChange(true)"
    @hide="onVisibleChange(false)"
  >
    <template #reference>
      <div class="task-bell" :class="{ active: store.hasActive }" title="任务队列">
        <el-icon :size="18"><Bell /></el-icon>
        <span v-if="store.hasActive" class="red-dot">
          <template v-if="store.activeCount > 1">{{ badge }}</template>
        </span>
      </div>
    </template>

    <div class="task-panel">
      <div class="panel-header">
        <span class="panel-title">任务队列</span>
        <el-tag v-if="store.hasActive" type="warning" size="small" effect="dark">
          {{ store.activeCount }} 进行中
        </el-tag>
        <el-tag v-else type="success" size="small" effect="plain">无进行中任务</el-tag>
      </div>

      <el-divider class="panel-divider" />

      <div v-if="store.sortedTasks.length === 0" class="panel-empty">
        暂无任务记录
      </div>

      <div v-else class="panel-list">
        <div
          v-for="t in store.sortedTasks.slice(0, 12)"
          :key="t.id"
          class="task-item"
          :class="{ clickable: !!t.gitRepoId }"
          @click="onTaskClick(t)"
        >
          <div class="task-row">
            <el-tag :type="statusMeta(t.status).type" size="small" effect="dark">
              {{ statusMeta(t.status).label }}
            </el-tag>
            <span class="task-type">{{ typeLabel(t.type) }}</span>
            <span class="task-time">{{ new Date(t.createdAt).toLocaleString() }}</span>
          </div>
          <div class="task-msg">{{ t.message || '—' }}</div>
          <el-progress
            v-if="t.status === 'processing' || t.status === 'pending'"
            :percentage="t.progress || 0"
            :stroke-width="6"
            :show-text="false"
          />
        </div>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.task-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: background-color 0.2s;
}
.task-bell:hover {
  background: var(--el-fill-color);
}
.task-bell.active {
  color: var(--el-color-primary);
}

.red-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 700;
  border: 2px solid var(--el-bg-color);
  box-sizing: content-box;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.panel-divider {
  margin: 10px 0;
}
.panel-empty {
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding: 24px 0;
}
.panel-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow-y: auto;
}
.task-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.task-item.clickable {
  cursor: pointer;
  transition: background-color 0.2s;
}
.task-item.clickable:hover {
  background: var(--el-color-primary-light-9);
}
.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.task-type {
  flex: 1;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-time {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.task-msg {
  margin: 6px 0 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
