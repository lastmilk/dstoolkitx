<script setup lang="ts">
import { reactive, ref } from 'vue'
import { request } from '@/utils/request'
import BaseTable from '@/components/base/BaseTable.vue'
import type { BaseTableColumn, BaseTableInstance } from '@/components/base/types'

const tableRef = ref<BaseTableInstance>()
const convTableRef = ref<BaseTableInstance>()

const search = reactive({ name: '' })
const drawerVisible = ref(false)
const currentConfig = ref<any | null>(null)
const convSearch = reactive<{ configId: number | null; title: string }>({ configId: null, title: '' })

const columns: BaseTableColumn[] = [
  { prop: 'id', label: 'ID', type: 'index' },
  { prop: 'name', label: '名称', type: 'normal' },
  { prop: 'user.username', label: '所属用户', type: 'short' },
  { prop: 'deepseekUserId', label: 'Deepseek 用户', type: 'long' },
  { prop: '_count.conversations', label: '会话数', type: 'short' },
  { prop: 'updatedAt', label: '更新时间', type: 'time', formatter: (row: any) => fmtTime(row.updatedAt) },
  { type: 'action', label: '操作', slot: 'action' },
]

const convColumns: BaseTableColumn[] = [
  { prop: 'deepseekConvId', label: '会话ID', type: 'long' },
  { prop: 'title', label: '标题', type: 'long' },
  { prop: '_count.messages', label: '消息数', type: 'short' },
  { prop: 'insertedAt', label: '时间', type: 'time', formatter: (row: any) => fmtTime(row.insertedAt) },
]

async function fetchConfigs(params: Record<string, any>) {
  const res: any = await request.get('/admin/configs', { params })
  return { records: res.records, total: res.total }
}

async function fetchConversations(params: Record<string, any>) {
  if (!params.configId) return { records: [], total: 0 }
  const res: any = await request.get('/admin/conversations', { params })
  return { records: res.records, total: res.total }
}

function handleSearch() {
  search.name = search.name.trim()
}

function handleReset() {
  search.name = ''
}

function openConversations(row: any) {
  currentConfig.value = row
  convSearch.configId = row.id
  convSearch.title = ''
  drawerVisible.value = true
}

function handleConvSearch() {
  convSearch.title = convSearch.title.trim()
}

function handleConvReset() {
  convSearch.title = ''
}

function fmtTime(v: string) {
  return v ? new Date(v).toLocaleString() : ''
}
</script>

<template>
  <div>
    <h2>配置 / 会话管理</h2>
    <el-form :inline="true" style="margin-bottom: 16px;">
      <el-form-item label="名称">
        <el-input v-model="search.name" placeholder="按配置名称搜索" clearable @keyup.enter="handleSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>
    <BaseTable ref="tableRef" :columns="columns" :request="fetchConfigs" :params="search">
      <template #action="{ row }">
        <el-button size="small" @click="openConversations(row)">查看会话</el-button>
      </template>
    </BaseTable>

    <el-drawer v-model="drawerVisible" :title="currentConfig?.name + ' 的会话'" size="60%">
      <el-form :inline="true" style="margin-bottom: 16px;">
        <el-form-item label="标题">
          <el-input v-model="convSearch.title" placeholder="按会话标题搜索" clearable @keyup.enter="handleConvSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleConvSearch">搜索</el-button>
          <el-button @click="handleConvReset">重置</el-button>
        </el-form-item>
      </el-form>
      <BaseTable ref="convTableRef" :columns="convColumns" :request="fetchConversations" :params="convSearch" />
    </el-drawer>
  </div>
</template>
