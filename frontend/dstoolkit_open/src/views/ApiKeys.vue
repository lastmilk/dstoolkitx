<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { confirmDanger } from '@/utils/sweetalert'
import type { ApiKeyItem } from '@/types'

const apiKeys = ref<ApiKeyItem[]>([])
const keyName = ref('')
const keyValue = ref('')
const addingKey = ref(false)

async function loadApiKeys() {
  const res: any = await request.get('/apikeys')
  apiKeys.value = (res.apiKeys ?? []) as ApiKeyItem[]
}

async function addKey() {
  if (!keyName.value || !keyValue.value) {
    ElMessage.error('请填写名称和 Key')
    return
  }
  addingKey.value = true
  try {
    await request.post('/apikeys', { name: keyName.value, key: keyValue.value })
    keyName.value = ''
    keyValue.value = ''
    await loadApiKeys()
    ElMessage.success('密钥已添加')
  } finally {
    addingKey.value = false
  }
}

async function deleteKey(id: number) {
  const ok = await confirmDanger('确认删除此密钥？', '删除后不可恢复')
  if (!ok) return
  await request.delete(`/apikeys/${id}`)
  await loadApiKeys()
  ElMessage.success('密钥已删除')
}

onMounted(loadApiKeys)
</script>

<template>
  <div>
    <el-alert
      type="info"
      show-icon
      :closable="false"
      class="tab-alert"
      title="添加第三方 API 密钥（如 DeepSeek API Key）供平台功能调用。密钥加密存储，列表仅显示掩码。"
    />

    <el-card shadow="never" class="form-card">
      <el-form inline @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="keyName" placeholder="如：工作密钥" class="input-name" />
        </el-form-item>
        <el-form-item label="密钥内容">
          <el-input v-model="keyValue" placeholder="sk-..." class="input-value" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="addingKey" @click="addKey">
            <el-icon :size="14"><Plus /></el-icon>
            添加密钥
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <span>密钥列表</span>
          <el-tag size="small" type="info">{{ apiKeys.length }} 个</el-tag>
        </div>
      </template>
      <el-table :data="apiKeys" stripe size="small" style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="密钥（掩码）" min-width="240">
          <template #default="{ row }">
            <code class="code-text">{{ row.masked }}</code>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="180">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="deleteKey(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
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
.input-value {
  width: 320px;
}
@media (max-width: 720px) {
  .input-name,
  .input-value {
    width: 100%;
  }
}
</style>
