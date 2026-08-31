<script setup lang="ts">
import { reactive, ref } from 'vue'
import { request } from '@/utils/request'
import { ElMessage } from 'element-plus'
import BaseTable from '@/components/base/BaseTable.vue'
import type { BaseTableColumn, BaseTableInstance } from '@/components/base/types'

const tableRef = ref<BaseTableInstance>()

const search = reactive({ username: '' })

const columns: BaseTableColumn[] = [
  { prop: 'id', label: 'ID', type: 'index' },
  { prop: 'username', label: '用户名', type: 'normal' },
  { prop: 'role', label: '角色', type: 'status', slot: 'role' },
  { prop: 'cloudSyncEnabled', label: '云端存储', type: 'status', slot: 'cloud' },
  { prop: 'createdAt', label: '创建时间', type: 'time', formatter: (row: any) => fmtTime(row.createdAt) },
  { type: 'action', label: '操作', slot: 'action' },
]

async function fetchUsers(params: Record<string, any>) {
  const res: any = await request.get('/admin/users', { params })
  return { records: res.records, total: res.total }
}

function handleSearch() {
  search.username = search.username.trim()
  // params 是响应式，watch 自动触发刷新；这里仅占位确保触发
}

function handleReset() {
  search.username = ''
}

async function toggleRole(row: any) {
  const newRole = row.role === 'ADMIN' ? 'USER' : 'ADMIN'
  await request.patch(`/admin/users/${row.id}`, { role: newRole })
  ElMessage.success('已切换角色')
  await tableRef.value?.fetchList()
}

function fmtTime(v: string) {
  return v ? new Date(v).toLocaleString() : ''
}
</script>

<template>
  <div>
    <h2>用户管理</h2>
    <el-form :inline="true" style="margin-bottom: 16px;">
      <el-form-item label="用户名">
        <el-input v-model="search.username" placeholder="按用户名搜索" clearable @keyup.enter="handleSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>
    <BaseTable ref="tableRef" :columns="columns" :request="fetchUsers" :params="search">
      <template #role="{ row }">
        <el-tag :type="row.role === 'ADMIN' ? 'danger' : 'info'">{{ row.role }}</el-tag>
      </template>
      <template #cloud="{ row }">
        <el-tag :type="row.cloudSyncEnabled ? 'success' : 'info'">
          {{ row.cloudSyncEnabled ? '开' : '关' }}
        </el-tag>
      </template>
      <template #action="{ row }">
        <el-button size="small" @click="toggleRole(row)">切换角色</el-button>
      </template>
    </BaseTable>
  </div>
</template>
