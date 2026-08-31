<script setup lang="ts">
import { reactive, ref } from 'vue'
import { request } from '@/utils/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import BaseTable from '@/components/base/BaseTable.vue'
import type { BaseTableColumn, BaseTableInstance } from '@/components/base/types'

const tableRef = ref<BaseTableInstance>()

const search = reactive({ name: '' })
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ name: '', url: '', description: '', category: 'official' })

const columns: BaseTableColumn[] = [
  { prop: 'id', label: 'ID', type: 'index' },
  { prop: 'name', label: '名称', type: 'normal' },
  { prop: 'url', label: 'URL', type: 'long' },
  { prop: 'category', label: '分类', type: 'short' },
  { type: 'action', label: '操作', slot: 'action' },
]

async function fetchMarket(params: Record<string, any>) {
  const res: any = await request.get('/admin/market', { params })
  return { records: res.records, total: res.total }
}

function handleSearch() {
  search.name = search.name.trim()
}

function handleReset() {
  search.name = ''
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.url = ''
  form.description = ''
  form.category = 'official'
  dialogVisible.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  form.name = row.name
  form.url = row.url
  form.description = row.description || ''
  form.category = row.category
  dialogVisible.value = true
}

async function save() {
  if (!form.name || !form.url) {
    ElMessage.error('请填写名称和 URL')
    return
  }
  if (editingId.value) {
    await request.put(`/market/${editingId.value}`, { ...form })
  } else {
    await request.post('/market', { ...form })
  }
  ElMessage.success('已保存')
  dialogVisible.value = false
  await tableRef.value?.fetchList()
}

async function remove(row: any) {
  await ElMessageBox.confirm('确认删除该条目？', '提示', { type: 'warning' })
  await request.delete(`/market/${row.id}`)
  ElMessage.success('已删除')
  await tableRef.value?.fetchList()
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h2 style="margin: 0;">应用市场管理</h2>
      <el-button type="primary" @click="openCreate">新增</el-button>
    </div>
    <el-form :inline="true" style="margin-bottom: 16px;">
      <el-form-item label="名称">
        <el-input v-model="search.name" placeholder="按名称搜索" clearable @keyup.enter="handleSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>
    <BaseTable ref="tableRef" :columns="columns" :request="fetchMarket" :params="search">
      <template #action="{ row }">
        <el-button size="small" @click="openEdit(row)">编辑</el-button>
        <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
      </template>
    </BaseTable>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑条目' : '新增条目'" width="460px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="form.url" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
        <el-form-item label="分类"><el-input v-model="form.category" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
