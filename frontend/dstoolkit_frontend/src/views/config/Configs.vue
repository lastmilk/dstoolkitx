<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { request } from '@/utils/request'
import * as sweetalert from '@/utils/sweetalert'
import {
  saveLocalConfig,
  getLocalConfigs,
  deleteLocalConfig,
  buildAndPersistIndex,
  incrementalUpdateIndex,
} from '@/utils/db'
import type { DeepseekConfig, UploadResult } from '@/types'

const auth = useAuthStore()
const router = useRouter()

interface ConfigItem extends Omit<DeepseekConfig, 'updatedAt'> {
  updatedAt?: number | string
}

// ===== 本地 / 云端双模式（el-segmented 切换，默认跟随账户 cloudSyncEnabled） =====
type Mode = 'local' | 'cloud'
const mode = ref<Mode>(auth.cloudSyncEnabled ? 'cloud' : 'local')
const modeOptions: Array<{ label: string; value: Mode }> = [
  { label: '本地模式', value: 'local' },
  { label: '云端模式', value: 'cloud' },
]

const configs = ref<ConfigItem[]>([])
const loading = ref(false)

async function reload() {
  loading.value = true
  try {
    if (mode.value === 'cloud') {
      const res: any = await request.get('/configs')
      configs.value = (res.configs ?? []) as ConfigItem[]
    } else {
      const local = await getLocalConfigs()
      configs.value = local.map((c) => ({
        id: null,
        name: c.name,
        deepseekUserId: c.deepseekUserId,
        deepseekEmail: c.deepseekEmail,
        deepseekMobile: c.deepseekMobile,
        updatedAt: c.updatedAt,
      }))
    }
  } finally {
    loading.value = false
  }
}

// ===== 导入 / 更新模态框 =====
const modalVisible = ref(false)
const modalMode = ref<'create' | 'update'>('create')
const modalName = ref('')
const modalFile = ref<File | null>(null)
const modalTarget = ref<ConfigItem | null>(null)
const submitting = ref(false)

function openCreate() {
  modalMode.value = 'create'
  modalName.value = ''
  modalFile.value = null
  modalTarget.value = null
  modalVisible.value = true
}

function openUpdate(item: ConfigItem) {
  modalMode.value = 'update'
  modalName.value = item.name
  modalFile.value = null
  modalTarget.value = item
  modalVisible.value = true
}

function onFileChange(file: UploadFile) {
  modalFile.value = file.raw ?? null
}

/** limit=1 时再次选择文件：直接替换为新文件 */
function onExceed(files: File[]) {
  modalFile.value = files[0] ?? null
}

async function submitModal() {
  if (!modalFile.value) {
    ElMessage.warning('请选择 Deepseek 导出的 zip 数据包')
    return
  }
  if (modalMode.value === 'create' && !modalName.value.trim()) {
    ElMessage.warning('请给这个账号起个名字')
    return
  }
  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('file', modalFile.value)
    fd.append('name', modalName.value.trim())
    const res = (await request.post('/configs', fd)) as UploadResult
    if (!res.persisted) {
      // 云端未持久化 → 存 IndexedDB 并构建 FlexSearch 索引
      await saveLocalConfig(res.config, res.conversations ?? [])
      try {
        if (modalMode.value === 'update' && modalTarget.value) {
          const changedConvIds = (res.conversations ?? []).map((c) => c.deepseekConvId)
          await incrementalUpdateIndex(
            modalTarget.value.deepseekUserId,
            changedConvIds,
            res.conversations ?? [],
          )
        } else {
          await buildAndPersistIndex(res.config.deepseekUserId, res.conversations ?? [])
        }
      } catch {
        /* 索引构建失败不阻断流程 */
      }
    }
    const count: number = res.conversations?.length ?? res.conversationCount ?? 0
    const action = modalMode.value === 'update' ? '更新' : '导入'
    sweetalert.success(
      `已${action}${res.persisted ? '云端' : '本地'}账号`,
      `共解析 ${count} 个对话`,
    )
    modalVisible.value = false
    await reload()
  } finally {
    submitting.value = false
  }
}

// ===== 移除 =====
async function removeConfig(item: ConfigItem) {
  const ok = await sweetalert.confirmDanger(
    '确定移除此账号？',
    '本地索引与缓存数据将一并清理，此操作不可撤销。',
  )
  if (!ok) return
  if (mode.value === 'cloud' && item.id != null) {
    await request.delete(`/configs/${item.id}`)
  } else {
    await deleteLocalConfig(item.deepseekUserId)
  }
  ElMessage.success('账号已移除')
  await reload()
}

function viewConversations() {
  router.push('/explore')
}

function fmtDate(d: number | string | undefined | null): string {
  if (!d) return ''
  return new Date(d).toLocaleString()
}

onMounted(reload)
</script>

<template>
  <div class="configs-page">
    <!-- 顶部工具条：标题 + 模式切换 + 导入按钮 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-title">
          <h2>配置管理</h2>
          <p class="toolbar-sub">导入 Deepseek 导出的 zip 数据包，管理本地 / 云端账号配置</p>
        </div>
        <div class="toolbar-actions">
          <el-segmented v-model="mode" :options="modeOptions" @change="reload" />
          <el-button type="primary" @click="openCreate">
            <el-icon style="margin-right: 6px;"><Plus /></el-icon>
            导入账号
          </el-button>
        </div>
      </div>
      <el-alert
        v-if="mode === 'cloud' && !auth.cloudSyncEnabled"
        title="当前账号未开启云端同步，云端列表可能为空；数据将保存在浏览器本地"
        type="info"
        :closable="false"
        style="margin-top: 12px;"
      />
    </el-card>

    <!-- 配置列表 -->
    <el-card shadow="never">
      <div v-loading="loading" class="list-wrap">
        <el-empty
          v-if="!loading && configs.length === 0"
          description="还没有导入的账号，点击右上角导入新账号"
          :image-size="80"
        />
        <div v-else class="config-grid">
          <el-card
            v-for="c in configs"
            :key="c.deepseekUserId"
            shadow="hover"
            class="config-card"
          >
            <div class="config-head">
              <div class="config-avatar">
                <el-icon :size="20"><User /></el-icon>
              </div>
              <div class="config-head-text">
                <h3 class="config-name">{{ c.name }}</h3>
                <el-tag size="small" type="info" effect="plain" class="config-id-tag">
                  <el-icon :size="10" style="margin-right: 4px;"><Coin /></el-icon>
                  {{ c.deepseekUserId.slice(0, 10) }}…
                </el-tag>
              </div>
            </div>

            <div class="config-meta">
              <div class="meta-row">
                <el-icon :size="14" style="color: var(--el-color-primary);"><User /></el-icon>
                <span>用户ID：{{ c.deepseekUserId.slice(0, 13) }}…</span>
              </div>
              <div v-if="c.deepseekMobile" class="meta-row">
                <el-icon :size="14" style="color: var(--el-color-success);"><Iphone /></el-icon>
                <span>手机：{{ c.deepseekMobile }}</span>
              </div>
              <div class="meta-row">
                <el-icon :size="14" style="color: var(--el-color-warning);"><Calendar /></el-icon>
                <span>最近更新：{{ fmtDate(c.updatedAt) }}</span>
              </div>
            </div>

            <div class="card-actions">
              <el-button size="small" @click="viewConversations">
                <el-icon :size="14" style="margin-right: 4px;"><View /></el-icon>
                查看
              </el-button>
              <el-button size="small" type="primary" plain @click="openUpdate(c)">
                <el-icon :size="14" style="margin-right: 4px;"><Refresh /></el-icon>
                更新
              </el-button>
              <el-button size="small" type="danger" plain @click="removeConfig(c)">
                <el-icon :size="14" style="margin-right: 4px;"><Delete /></el-icon>
                移除
              </el-button>
            </div>
          </el-card>
        </div>
      </div>
    </el-card>

    <!-- 导入 / 更新模态框 -->
    <el-dialog
      v-model="modalVisible"
      :title="modalMode === 'create' ? '导入新的 Deepseek 账号' : '更新此账号数据（上传新数据包）'"
      width="480px"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item v-if="modalMode === 'create'" label="账号名称">
          <el-input v-model="modalName" placeholder="例如：工作主账号、个人账号" />
        </el-form-item>
        <el-form-item v-else label="账号名称">
          <el-input :model-value="modalName" disabled />
        </el-form-item>
        <el-form-item label="数据包（zip 压缩包）">
          <el-upload
            :limit="1"
            accept=".zip"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="onFileChange"
            :on-exceed="onExceed"
          >
            <el-button>
              <el-icon style="margin-right: 6px;"><FolderOpened /></el-icon>
              选择数据包
            </el-button>
          </el-upload>
          <div v-if="modalFile" class="file-tag">
            <el-icon :size="14"><Box /></el-icon>
            {{ modalFile.name }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modalVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitModal">
          {{ modalMode === 'create' ? '导入' : '更新' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.configs-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部工具条 */
.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.toolbar-title h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.toolbar-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* 列表 */
.list-wrap {
  min-height: 200px;
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.config-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.config-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.config-head-text {
  min-width: 0;
}
.config-name {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.config-id-tag {
  font-family: var(--el-font-family, sans-serif);
}

.config-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.card-actions .el-button {
  flex: 1;
  margin-left: 0;
}

/* 模态框内已选文件标签 */
.file-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border: 1px solid var(--el-color-primary-light-7);
}

@media (max-width: 720px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
  .toolbar-actions {
    width: 100%;
  }
}
</style>
