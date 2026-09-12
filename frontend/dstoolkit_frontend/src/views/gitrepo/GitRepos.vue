<script setup lang="ts">
/**
 * GitRepos.vue
 * 对话仓库首页：先创建仓库，之后再上传对话记录压缩包。
 *
 * 上传流程：上传压缩包 → 解压 → 统计对话数 → 按轮次拆分 → 推送至 Git 仓库
 * 任务进入持久化队列（断电可续传），通过右上角小红点通知栏查看进度。
 * 同步双写 Conversation 表，供 Explore/Stats/Export 下游复用。
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type UploadRequestOptions } from 'element-plus'
import { Plus, UploadFilled, Folder, Refresh, Document } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { useTaskQueueStore } from '@/stores/taskQueue'

const router = useRouter()
const taskStore = useTaskQueueStore()

interface GitRepo {
  id: number
  name: string
  repoFsName: string
  description: string | null
  status: string
  conversationCount: number
  lastPushAt: string | null
  createdAt: string
}

const repos = ref<GitRepo[]>([])
const loading = ref(false)

// 创建仓库
const createVisible = ref(false)
const createForm = ref({ name: '', description: '' })
const creating = ref(false)

// 上传压缩包
const uploadRepoId = ref<number | null>(null)
const uploading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = (await request.get('/git-repos')) as { repos: GitRepo[] }
    repos.value = res.repos ?? []
  } finally {
    loading.value = false
  }
}

async function createRepo(): Promise<void> {
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请填写仓库名称')
    return
  }
  creating.value = true
  try {
    await request.post('/git-repos', {
      name: createForm.value.name.trim(),
      description: createForm.value.description.trim() || undefined,
    })
    ElMessage.success('仓库已创建，可以上传对话记录了')
    createVisible.value = false
    createForm.value = { name: '', description: '' }
    await load()
  } finally {
    creating.value = false
  }
}

function openUpload(repo: GitRepo): void {
  uploadRepoId.value = repo.id
}

/** el-upload 自定义请求：调用 /git-repos/:id/upload */
async function customUpload(opts: UploadRequestOptions): Promise<void> {
  if (!uploadRepoId.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', opts.file as File)
    const res = (await request.post(
      `/git-repos/${uploadRepoId.value}/upload`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )) as { taskId: number; message: string }
    ElMessage.success(`任务已入队 #${res.taskId}：正在 解压 → 统计 → 拆分 → 推送`)
    uploadRepoId.value = null
    // 立即拉取任务列表 + 活跃数（驱动小红点）
    await taskStore.refreshActiveCount()
    await taskStore.refreshTasks()
    await load()
  } catch {
    /* 拦截器已提示 */
  } finally {
    uploading.value = false
  }
}

function statusMeta(status: string): { label: string; type: 'info' | 'success' | 'warning' } {
  switch (status) {
    case 'empty':
      return { label: '空仓库', type: 'info' }
    case 'active':
      return { label: '已推送', type: 'success' }
    case 'failed':
      return { label: '失败', type: 'warning' }
    default:
      return { label: status, type: 'info' }
  }
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString()
}

onMounted(load)
</script>

<template>
  <div class="git-repos-page">
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2>对话仓库</h2>
          <p class="header-sub">先创建仓库 · 上传压缩包后自动拆分存储 · 任务队列断电续传</p>
        </div>
        <div class="header-actions">
          <el-button :icon="Refresh" @click="load">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="createVisible = true">创建仓库</el-button>
        </div>
      </div>
    </el-card>

    <el-card v-loading="loading" shadow="never">
      <el-empty v-if="!loading && repos.length === 0" description="还没有仓库，先创建一个吧">
        <el-button type="primary" :icon="Plus" @click="createVisible = true">创建仓库</el-button>
      </el-empty>

      <div v-else class="repo-list">
        <div v-for="r in repos" :key="r.id" class="repo-card">
          <div class="repo-head">
            <el-icon :size="22" class="repo-icon"><Folder /></el-icon>
            <div class="repo-title-block">
              <span class="repo-name" @click="router.push(`/git-repos/${r.id}`)">{{ r.name }}</span>
              <el-tag :type="statusMeta(r.status).type" size="small" effect="plain">
                {{ statusMeta(r.status).label }}
              </el-tag>
            </div>
            <div class="repo-spacer" />
            <el-button text :icon="Document" @click="router.push(`/git-repos/${r.id}`)">详情</el-button>
            <el-button type="primary" plain :icon="UploadFilled" @click="openUpload(r)">上传对话记录</el-button>
          </div>
          <div class="repo-desc">{{ r.description || '—' }}</div>
          <div class="repo-meta">
            <span>对话数：<b>{{ r.conversationCount }}</b></span>
            <span>文件名：<code>{{ r.repoFsName }}</code></span>
            <span>最近推送：{{ formatDate(r.lastPushAt) }}</span>
            <span>创建：{{ formatDate(r.createdAt) }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 创建仓库对话框 -->
    <el-dialog v-model="createVisible" title="创建对话仓库" width="460px">
      <el-form label-position="top">
        <el-form-item label="仓库名称" required>
          <el-input v-model="createForm.name" placeholder="例如：my-conversations" />
        </el-form-item>
        <el-form-item label="描述（可选）">
          <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="仓库用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createRepo">创建</el-button>
      </template>
    </el-dialog>

    <!-- 上传压缩包对话框 -->
    <el-dialog
      v-model="uploadRepoId"
      title="上传对话记录压缩包"
      width="520px"
      @close="uploadRepoId = null"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="上传后将自动执行：解压 → 统计对话数 → 按轮次拆分 → 推送至 Git 仓库"
        description="任务进入持久化队列，可在右上角小红点通知栏查看进度，支持断电续传。"
      />
      <el-upload
        drag
        :auto-upload="true"
        :show-file-list="false"
        :http-request="customUpload"
        accept=".zip,.gz,.tar,.tgz"
        class="upload-dragger"
      >
        <el-icon :size="42" class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">拖拽压缩包到此处，或点击选择</div>
        <template #tip>
          <div class="upload-tip">支持 zip / tar.gz 格式，单文件最大 200MB</div>
        </template>
      </el-upload>
      <div v-if="uploading" class="uploading-text">正在上传压缩包…</div>
    </el-dialog>
  </div>
</template>

<style scoped>
.git-repos-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.header-card :deep(.el-card__body) {
  padding: 16px 20px;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.header-row h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--el-text-color-primary);
}
.header-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.header-actions {
  display: flex;
  gap: 8px;
}
.repo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.repo-card {
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition: border-color 0.2s;
}
.repo-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.repo-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.repo-icon {
  color: var(--el-color-primary);
}
.repo-title-block {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.repo-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.repo-name:hover {
  color: var(--el-color-primary);
}
.repo-spacer {
  flex: 1;
}
.repo-desc {
  margin: 8px 0 6px;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.repo-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}
.repo-meta b {
  color: var(--el-text-color-primary);
}
.repo-meta code {
  background: var(--el-fill-color-light);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11.5px;
}
.upload-dragger {
  margin-top: 14px;
}
.upload-icon {
  color: var(--el-color-primary);
}
.upload-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.upload-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.uploading-text {
  margin-top: 12px;
  font-size: 13px;
  color: var(--el-color-primary);
  text-align: center;
}
</style>
