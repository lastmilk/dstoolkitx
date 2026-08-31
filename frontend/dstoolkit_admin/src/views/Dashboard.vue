<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '@/utils/request'

const stats = ref<any>({})

const LABELS: Record<string, string> = {
  users: '用户数',
  configs: '配置数',
  conversations: '会话数',
  messages: '消息数',
  apiKeys: 'API Key 数',
  marketEntries: '市场条目',
}

const items = ref<{ key: string; label: string; value: number }[]>([])

async function load() {
  stats.value = await request.get('/admin/stats')
  items.value = Object.entries(stats.value).map(([k, v]) => ({
    key: k,
    label: LABELS[k] || k,
    value: v as number,
  }))
}

onMounted(load)
</script>

<template>
  <div>
    <h2>仪表盘</h2>
    <el-row :gutter="16">
      <el-col v-for="it in items" :key="it.key" :span="6" style="margin-bottom: 16px;">
        <el-card shadow="hover">
          <div style="font-size: 13px; color: #999;">{{ it.label }}</div>
          <div style="font-size: 28px; font-weight: 700; color: #409eff;">{{ it.value }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
