<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, CopyDocument } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { confirmDanger } from '@/utils/sweetalert'
import type { OAuthClient } from '@/types'

const clients = ref<OAuthClient[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const creating = ref(false)
const form = ref({
  name: '',
  redirectUris: '',
  scopes: 'read:conversations profile',
  isPublic: true,
})

async function loadClients() {
  loading.value = true
  try {
    const res: any = await request.get('/oauth/clients')
    clients.value = (res.clients ?? []) as OAuthClient[]
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { name: '', redirectUris: '', scopes: 'read:conversations profile', isPublic: true }
  dialogVisible.value = true
}

async function createClient() {
  if (!form.value.name.trim()) {
    ElMessage.error('请填写应用名称')
    return
  }
  const uris = form.value.redirectUris
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (uris.length === 0) {
    ElMessage.error('请至少填写一个回调地址')
    return
  }
  const scopes = form.value.scopes
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  creating.value = true
  try {
    await request.post('/oauth/clients', {
      name: form.value.name.trim(),
      redirectUris: uris,
      scopes,
      isPublic: form.value.isPublic,
    })
    dialogVisible.value = false
    await loadClients()
    ElMessage.success('应用已创建')
  } finally {
    creating.value = false
  }
}

async function deleteClient(id: number) {
  const ok = await confirmDanger('确认删除此 OAuth 应用？', '删除后所有已授权的令牌将失效，不可恢复')
  if (!ok) return
  await request.delete(`/oauth/clients/${id}`)
  await loadClients()
  ElMessage.success('应用已删除')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

onMounted(loadClients)
</script>

<template>
  <div>
    <el-alert
      type="info"
      show-icon
      :closable="false"
      class="tab-alert"
      title="创建 OAuth2 应用，让第三方通过授权码 + PKCE 流程获取访问令牌，从而调用 /api/v1/* 接口。所有应用均为公共客户端（无 client_secret）。"
    />

    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">我的 OAuth 应用</span>
          <el-button type="primary" size="small" @click="openCreate">
            <el-icon :size="14"><Plus /></el-icon>
            创建应用
          </el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="clients" stripe size="small" style="width: 100%">
        <el-table-column prop="name" label="应用名称" min-width="140" />
        <el-table-column label="Client ID" min-width="200">
          <template #default="{ row }">
            <code class="code-text">{{ row.clientId }}</code>
          </template>
        </el-table-column>
        <el-table-column label="回调地址" min-width="200">
          <template #default="{ row }">
            <div v-for="uri in row.redirectUris" :key="uri" class="uri-line">
              <code class="code-text">{{ uri }}</code>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Scopes" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="s in row.scopes" :key="s" size="small" class="scope-tag" effect="plain">
              {{ s }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.isPublic ? '公共' : '机密' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click="copyText(row.clientId)">
              <el-icon :size="14"><CopyDocument /></el-icon>
              复制 ID
            </el-button>
            <el-button size="small" type="danger" text @click="deleteClient(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建应用对话框 -->
    <el-dialog v-model="dialogVisible" title="创建 OAuth 应用" width="520px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="应用名称" required>
          <el-input v-model="form.name" placeholder="如：我的数据分析工具" />
        </el-form-item>
        <el-form-item label="回调地址（每行一个）" required>
          <el-input
            v-model="form.redirectUris"
            type="textarea"
            :rows="3"
            placeholder="https://example.com/callback"
          />
        </el-form-item>
        <el-form-item label="授权范围（空格或逗号分隔）">
          <el-input v-model="form.scopes" placeholder="read:conversations profile search" />
        </el-form-item>
        <el-form-item label="客户端类型">
          <el-radio-group v-model="form.isPublic">
            <el-radio :value="true">公共客户端（PKCE，推荐）</el-radio>
            <el-radio :value="false">机密客户端</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createClient">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-alert {
  margin-bottom: 16px;
}
.table-card {
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
.uri-line {
  margin-bottom: 2px;
}
.scope-tag {
  margin-right: 4px;
  margin-bottom: 2px;
}
</style>
