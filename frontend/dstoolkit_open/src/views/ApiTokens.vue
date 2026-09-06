<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Lightning, CopyDocument, CircleCheck } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { confirmDanger } from '@/utils/sweetalert'
import type { ApiTokenItem, CreatedApiToken } from '@/types'

const apiTokens = ref<ApiTokenItem[]>([])
const tokenName = ref('')
const tokenExpiry = ref<number>(30)
const tokenCreating = ref(false)
const newlyCreated = ref<CreatedApiToken | null>(null)
const showTokenModal = ref(false)

const expiryOptions = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '365 天', value: 365 },
  { label: '永久有效', value: 0 },
]

async function loadApiTokens() {
  const res: any = await request.get('/tokens')
  apiTokens.value = (res.tokens ?? []) as ApiTokenItem[]
}

async function createToken() {
  if (!tokenName.value.trim()) {
    ElMessage.error('请填写令牌名称')
    return
  }
  tokenCreating.value = true
  try {
    const res: any = await request.post('/tokens', {
      name: tokenName.value.trim(),
      expiresInDays: tokenExpiry.value || undefined,
    })
    newlyCreated.value = res as CreatedApiToken
    showTokenModal.value = true
    tokenName.value = ''
    await loadApiTokens()
    ElMessage.success('API 令牌已生成，请立即保存')
  } finally {
    tokenCreating.value = false
  }
}

async function deleteToken(id: number) {
  const ok = await confirmDanger('确认撤销该令牌？', '撤销后立即失效，不可恢复')
  if (!ok) return
  await request.delete(`/tokens/${id}`)
  await loadApiTokens()
  ElMessage.success('令牌已撤销')
}

async function copyNewToken() {
  if (!newlyCreated.value) return
  try {
    await navigator.clipboard.writeText(newlyCreated.value.token)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

function tokenExpired(row: ApiTokenItem): boolean {
  return !!row.expiresAt && new Date(row.expiresAt) < new Date()
}

onMounted(loadApiTokens)
</script>

<template>
  <div>
    <el-alert
      type="info"
      show-icon
      :closable="false"
      class="tab-alert"
      title="生成访问令牌后，可通过 RESTful API（/api/v1/*）访问数据。明文仅在创建时显示一次，服务端仅存哈希，请立即保存。"
    />

    <el-card shadow="never" class="form-card">
      <el-form inline @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="tokenName" placeholder="如：脚本采集" class="input-name" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-select v-model="tokenExpiry" class="input-expiry">
            <el-option
              v-for="opt in expiryOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="tokenCreating" @click="createToken">
            <el-icon :size="14"><Lightning /></el-icon>
            生成令牌
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <span>令牌列表</span>
          <el-tag size="small" type="info">{{ apiTokens.length }} 个</el-tag>
        </div>
      </template>
      <el-table :data="apiTokens" stripe size="small" style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="令牌（掩码）" min-width="180">
          <template #default="{ row }">
            <code class="code-text">{{ row.masked }}</code>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="tokenExpired(row) ? 'danger' : 'success'" size="small">
              {{ tokenExpired(row) ? '已过期' : '有效' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="最后使用" min-width="170">
          <template #default="{ row }">
            {{ row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="过期时间" min-width="170">
          <template #default="{ row }">
            {{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '永久' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="deleteToken(row.id)">撤销</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 令牌明文一次性展示 -->
    <el-dialog
      v-model="showTokenModal"
      title="令牌已生成"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        class="token-alert"
        title="明文令牌仅此一次显示，请立即复制并妥善保存"
        description="关闭后无法再次查看，服务端仅保存哈希；如丢失只能撤销后重新生成新令牌。"
      />
      <div v-if="newlyCreated" class="token-display">
        <div class="token-label">BEARER TOKEN</div>
        <code class="token-code">{{ newlyCreated.token }}</code>
      </div>
      <template #footer>
        <el-button plain @click="showTokenModal = false">
          <el-icon :size="14"><CircleCheck /></el-icon>
          我已保存
        </el-button>
        <el-button type="primary" @click="copyNewToken">
          <el-icon :size="14"><CopyDocument /></el-icon>
          复制令牌
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-alert {
  margin-bottom: 16px;
}
.form-card {
  margin-bottom: 16px;
  border-radius: 10px;
}
.table-card {
  border-radius: 10px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}
.input-name {
  width: 200px;
}
.input-expiry {
  width: 160px;
}
.token-alert {
  margin-bottom: 16px;
}
.token-display {
  padding: 14px 16px;
  background: var(--el-fill-color-dark);
  border-radius: 8px;
  word-break: break-all;
}
.token-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: 0.08em;
}
.token-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.6;
}
@media (max-width: 720px) {
  .input-name,
  .input-expiry {
    width: 100%;
  }
}
</style>
