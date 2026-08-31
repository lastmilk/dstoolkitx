<script setup lang="ts">
import { reactive, ref } from 'vue'
import { request } from '@/utils/request'
import BaseTable from '@/components/base/BaseTable.vue'
import type { BaseTableColumn, BaseTableInstance } from '@/components/base/types'

const tableRef = ref<BaseTableInstance>()

const search = reactive({ name: '' })

const columns: BaseTableColumn[] = [
  { prop: 'id', label: 'ID', type: 'index' },
  { prop: 'name', label: '名称', type: 'normal' },
  { prop: 'username', label: '所属用户', type: 'short' },
  { prop: 'masked', label: 'Key（掩码）', type: 'long' },
  { prop: 'createdAt', label: '创建时间', type: 'time', formatter: (row: any) => fmtTime(row.createdAt) },
]

async function fetchApiKeys(params: Record<string, any>) {
  const res: any = await request.get('/admin/apikeys', { params })
  return { records: res.records, total: res.total }
}

function handleSearch() {
  search.name = search.name.trim()
}

function handleReset() {
  search.name = ''
}

function fmtTime(v: string) {
  return v ? new Date(v).toLocaleString() : ''
}
</script>

<template>
  <div>
    <h2>API Key 管理</h2>
    <el-form :inline="true" style="margin-bottom: 16px;">
      <el-form-item label="名称">
        <el-input v-model="search.name" placeholder="按名称搜索" clearable @keyup.enter="handleSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>
    <BaseTable ref="tableRef" :columns="columns" :request="fetchApiKeys" :params="search" />
  </div>
</template>
