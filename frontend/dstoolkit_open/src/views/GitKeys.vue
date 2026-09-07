<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, CopyDocument, CircleCheck, Download } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { confirmDanger } from '@/utils/sweetalert'
import type { GitApiKeyItem, GitKeysInfo, GitContainer } from '@/types'

const GIT_USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/

const gitInfo = ref<GitKeysInfo | null>(null)
const gitKeys = ref<GitApiKeyItem[]>([])
const gitContainers = ref<GitContainer[]>([])
const gitUsernameInput = ref('')
const gitUsernameSaving = ref(false)

const gitKeyDialog = ref(false)
const gitKeyName = ref('')
const gitKeyScope = ref<'container' | 'global'>('container')
const gitKeyContainerId = ref<number | null>(null)
const gitKeyExpiry = ref<number>(0)
const gitKeyCreating = ref(false)
const gitCreatedKey = ref<GitApiKeyItem | null>(null)
const showGitKeyModal = ref(false)
const gitCloneHost = ref(typeof location !== 'undefined' ? location.host : '')

async function loadGitInfo() {
  try {
    const res: any = await request.get('/gitkeys')
    gitInfo.value = res as GitKeysInfo
    gitKeys.value = (res.keys ?? []) as GitApiKeyItem[]
    gitUsernameInput.value = res.gitUsername ?? ''
  } catch {
    gitInfo.value = null
  }
  try {
    const c: any = await request.get('/configs')
    gitContainers.value = (c.configs ?? []).map((x: any) => ({ id: x.id, name: x.name }))
  } catch {
    gitContainers.value = []
  }
}

async function saveGitUsername() {
  const name = gitUsernameInput.value.trim()
  if (!GIT_USERNAME_RE.test(name)) {
    ElMessage.error('Git 用户名只能包含英文、数字、下划线（3-32 位）')
    return
  }
  gitUsernameSaving.value = true
  try {
    await request.post('/gitkeys/username', { gitUsername: name })
    ElMessage.success('Git 推送用户名已设置')
    await loadGitInfo()
  } finally {
    gitUsernameSaving.value = false
  }
}

function openGitKeyDialog() {
  gitKeyName.value = ''
  gitKeyScope.value = 'container'
  gitKeyContainerId.value = gitContainers.value[0]?.id ?? null
  gitKeyExpiry.value = 0
  gitCreatedKey.value = null
  gitKeyDialog.value = true
}

async function createGitKey() {
  if (!gitKeyName.value.trim()) {
    ElMessage.error('请填写名称')
    return
  }
  if (gitKeyScope.value === 'container' && gitKeyContainerId.value == null) {
    ElMessage.error('请选择要授权的对话容器')
    return
  }
  gitKeyCreating.value = true
  try {
    const payload: Record<string, unknown> = {
      name: gitKeyName.value.trim(),
      expiresInDays: gitKeyExpiry.value || undefined,
    }
    if (gitKeyScope.value === 'container') {
      payload.containerId = gitKeyContainerId.value
    } else {
      payload.confirmGlobal = true
    }
    const res: any = await request.post('/gitkeys', payload)
    gitCreatedKey.value = res as GitApiKeyItem
    gitKeyName.value = ''
    gitKeyDialog.value = false
    showGitKeyModal.value = true
    await loadGitInfo()
    ElMessage.success('Git APIKey 已生成，请立即保存')
  } finally {
    gitKeyCreating.value = false
  }
}

async function copyGitKey() {
  if (!gitCreatedKey.value?.key) return
  try {
    await navigator.clipboard.writeText(gitCreatedKey.value.key)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

async function revokeGitKey(id: number) {
  const ok = await confirmDanger('确认撤销该 Git APIKey？', '撤销后立即失效，已配置的客户端将无法再推送/拉取')
  if (!ok) return
  await request.delete(`/gitkeys/${id}`)
  await loadGitInfo()
  ElMessage.success('Git APIKey 已撤销')
}

function gitKeyExpired(row: GitApiKeyItem): boolean {
  return !!row.expiresAt && new Date(row.expiresAt) < new Date()
}

function gitScopeLabel(row: GitApiKeyItem): string {
  if (row.scope === 'global') return '全局（所有容器）'
  return gitContainers.value.find((c) => c.id === row.containerId)?.name ?? `容器 #${row.containerId}`
}

onMounted(loadGitInfo)
</script>

<template>
  <div>
    <el-alert
      type="info"
      show-icon
      :closable="false"
      class="tab-alert"
      title="Git 推送/拉取使用「Git 用户名 + Git APIKey」进行 Basic 鉴权。任何客户端（Web / Flutter / 标准 Git CLI）推送时都需要：git clone http://&lt;Git用户名&gt;:&lt;dstkg_ APIKey&gt;@host/git/u&lt;userId&gt;_c&lt;containerId&gt;.git"
    />

    <!-- Git 推送用户名 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="card-title">Git 推送用户名</span>
      </template>
      <el-alert
        v-if="gitInfo?.needsGitUsername"
        type="warning"
        show-icon
        :closable="false"
        class="inner-alert"
        title="你的用户名包含中文：首次生成 Git APIKey 前，必须设置一个英文/数字/下划线组成的 Git 推送用户名"
      />
      <el-form inline @submit.prevent>
        <el-form-item label="用户名">
          <el-input
            v-model="gitUsernameInput"
            :disabled="!!gitInfo?.gitUsername && !gitInfo?.needsGitUsername"
            placeholder="3-32 位：英文、数字、下划线"
            class="input-name"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="gitUsernameSaving"
            :disabled="!!gitInfo?.gitUsername && !gitInfo?.needsGitUsername"
            @click="saveGitUsername"
          >
            保存
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- APIKey 列表 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">Git APIKey 列表</span>
          <el-button type="primary" plain size="small" @click="openGitKeyDialog">
            <el-icon :size="14"><Plus /></el-icon>
            生成 Git APIKey
          </el-button>
        </div>
      </template>
      <el-table :data="gitKeys" stripe size="small" style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="Key（掩码）" min-width="170">
          <template #default="{ row }">
            <code class="code-text">{{ row.masked }}</code>
          </template>
        </el-table-column>
        <el-table-column label="作用域" min-width="130">
          <template #default="{ row }">{{ gitScopeLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.revokedAt" type="danger" size="small">已撤销</el-tag>
            <el-tag v-else-if="gitKeyExpired(row)" type="warning" size="small">已过期</el-tag>
            <el-tag v-else type="success" size="small">有效</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后使用" min-width="160">
          <template #default="{ row }">
            {{ row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="过期时间" min-width="160">
          <template #default="{ row }">
            {{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '永久' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain :disabled="!!row.revokedAt" @click="revokeGitKey(row.id)">
              撤销
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 生成 Git APIKey 对话框 -->
    <el-dialog v-model="gitKeyDialog" title="生成 Git APIKey" width="480px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="gitKeyName" placeholder="如：Web 浏览器、Flutter 手机" />
        </el-form-item>
        <el-form-item label="作用域">
          <el-radio-group v-model="gitKeyScope">
            <el-radio value="container">仅单个对话容器（推荐）</el-radio>
            <el-radio value="global">全局（所有容器，安全性略低）</el-radio>
          </el-radio-group>
          <el-select
            v-if="gitKeyScope === 'container'"
            v-model="gitKeyContainerId"
            placeholder="选择对话容器"
            style="width: 100%; margin-top: 8px;"
          >
            <el-option v-for="c in gitContainers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-alert
            v-if="gitKeyScope === 'global'"
            type="warning"
            :closable="false"
            style="margin-top: 8px;"
            title="全局 Key 可访问你名下所有对话容器仓库，泄露时影响面更大，不推荐"
          />
        </el-form-item>
        <el-form-item label="有效期">
          <el-select v-model="gitKeyExpiry" style="width: 100%;">
            <el-option label="7 天" :value="7" />
            <el-option label="30 天" :value="30" />
            <el-option label="90 天" :value="90" />
            <el-option label="365 天" :value="365" />
            <el-option label="永久有效" :value="0" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gitKeyDialog = false">取消</el-button>
        <el-button type="primary" :loading="gitKeyCreating" @click="createGitKey">生成</el-button>
      </template>
    </el-dialog>

    <!-- Git APIKey 明文展示（仅一次） -->
    <el-dialog v-model="showGitKeyModal" title="Git APIKey 已生成" width="520px" :close-on-click-modal="false">
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="明文仅此一次显示，服务端只存哈希。请立即复制保存。"
        style="margin-bottom: 12px;"
      />
      <code class="code-text git-key-plain">{{ gitCreatedKey?.key }}</code>
      <div class="git-key-usage">
        <div class="usage-label">客户端用法（Git 标准 Basic 鉴权）：</div>
        <code class="code-text">
          git clone http://{{ gitInfo?.gitUsername }}:{{ '<APIKey>' }}@{{ gitCloneHost }}/git/u{{ '<userId>' }}_c{{ '<containerId>' }}.git
        </code>
      </div>
      <template #footer>
        <el-button plain @click="showGitKeyModal = false">
          <el-icon :size="14"><CircleCheck /></el-icon>
          我已保存
        </el-button>
        <el-button type="primary" @click="copyGitKey">
          <el-icon :size="14"><CopyDocument /></el-icon>
          复制 Key
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-alert {
  margin-bottom: 16px;
}
.section-card {
  margin-bottom: 16px;
  border-radius: 10px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-weight: 600;
}
.inner-alert {
  margin-bottom: 16px;
}
.input-name {
  width: 260px;
}
.git-key-plain {
  display: block;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  word-break: break-all;
  font-size: 13px;
}
.git-key-usage {
  margin-top: 12px;
}
.usage-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.git-key-usage .code-text {
  display: block;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  word-break: break-all;
  font-size: 12px;
}
@media (max-width: 720px) {
  .input-name {
    width: 100%;
  }
}
</style>
