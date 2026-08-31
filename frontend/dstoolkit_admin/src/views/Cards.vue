<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/utils/request'
import BaseTable from '@/components/base/BaseTable.vue'
import type { BaseTableColumn, BaseTableInstance } from '@/components/base/types'

const tableRef = ref<BaseTableInstance>()

const search = reactive({
  tier: '' as '' | 'PRO' | 'PLUS' | 'ULTIMATE',
  status: '' as '' | 'UNUSED' | 'USED' | 'REVOKED',
  batchId: '',
})

const TIER_TAG_TYPE: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  PRO: 'success',
  PLUS: 'warning',
  ULTIMATE: 'danger',
}
const TIER_LABEL: Record<string, string> = { PRO: '高级版', PLUS: '顶级版', ULTIMATE: '超能版' }
const DURATION_LABEL: Record<string, string> = { PERMANENT: '永久', ANNUAL: '年费' }
const STATUS_TAG_TYPE: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  UNUSED: 'info',
  USED: 'success',
  REVOKED: 'danger',
}
const STATUS_LABEL: Record<string, string> = { UNUSED: '未使用', USED: '已使用', REVOKED: '已作废' }

const columns: BaseTableColumn[] = [
  { prop: 'id', label: 'ID', type: 'index' },
  { prop: 'code', label: '卡密', type: 'long' },
  { prop: 'tier', label: '等级', type: 'status', slot: 'tier' },
  { prop: 'duration', label: '时长', type: 'status', slot: 'duration' },
  { prop: 'status', label: '状态', type: 'status', slot: 'status' },
  { prop: 'usedBy', label: '使用者', type: 'short', slot: 'usedBy' },
  { prop: 'batchId', label: '批次', type: 'normal', showOverflowTooltip: true },
  { prop: 'createdAt', label: '创建时间', type: 'time', formatter: (row: any) => fmtTime(row.createdAt) },
  { prop: 'redeemedAt', label: '兑换时间', type: 'time', formatter: (row: any) => fmtTime(row.redeemedAt) },
  { type: 'action', label: '操作', slot: 'action' },
]

async function fetchCards(params: Record<string, any>) {
  // 去掉空字符串参数，避免后端 where 误匹配
  const clean: Record<string, any> = { ...params }
  Object.keys(clean).forEach((k) => {
    if (clean[k] === '' || clean[k] == null) delete clean[k]
  })
  const res: any = await request.get('/admin/cards', { params: clean })
  return { records: res.records, total: res.total }
}

function handleSearch() {
  // 触发 BaseTable watch 的方式：让 reactive 引用变更
  search.batchId = search.batchId.trim()
}

function handleReset() {
  search.tier = ''
  search.status = ''
  search.batchId = ''
}

async function revoke(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认作废卡密 ${row.code} 吗？此操作不可撤销。`,
      '作废确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await request.post(`/admin/cards/${row.id}/revoke`)
  ElMessage.success('已作废')
  await tableRef.value?.fetchList()
}

function copyCode(code: string) {
  navigator.clipboard?.writeText(code).then(() => ElMessage.success('已复制卡密'))
}

// ===== 生成卡密弹窗 =====
const genDialog = reactive({
  visible: false,
  loading: false,
  tier: 'PRO' as 'PRO' | 'PLUS' | 'ULTIMATE',
  duration: 'PERMANENT' as 'PERMANENT' | 'ANNUAL',
  count: 1,
  expiresAt: '' as string,
})

const genResult = ref<{ batchId: string; codes: string[] } | null>(null)

async function submitGenerate() {
  if (genDialog.count < 1 || genDialog.count > 1000) {
    ElMessage.warning('数量须在 1~1000 之间')
    return
  }
  genDialog.loading = true
  try {
    const payload: any = {
      tier: genDialog.tier,
      duration: genDialog.duration,
      count: genDialog.count,
    }
    if (genDialog.expiresAt) {
      const d = new Date(genDialog.expiresAt + 'T23:59:59')
      payload.expiresAt = d.toISOString()
    }
    const res: any = await request.post('/admin/cards/generate', payload)
    genResult.value = { batchId: res.batchId, codes: res.codes }
    ElMessage.success(`已生成 ${res.codes.length} 张卡密`)
    await tableRef.value?.fetchList()
  } finally {
    genDialog.loading = false
  }
}

function closeGenDialog() {
  genDialog.visible = false
  genResult.value = null
  genDialog.tier = 'PRO'
  genDialog.duration = 'PERMANENT'
  genDialog.count = 1
  genDialog.expiresAt = ''
}

function copyAllCodes() {
  if (!genResult.value) return
  const text = genResult.value.codes.join('\n')
  navigator.clipboard?.writeText(text).then(() => ElMessage.success('已复制全部卡密'))
}

function fmtTime(v: string) {
  return v ? new Date(v).toLocaleString() : ''
}

// 控制生成结果区域显示
const showResult = computed(() => genResult.value !== null)
</script>

<template>
  <div>
    <h2 style="display: flex; justify-content: space-between; align-items: center;">
      <span>卡密管理</span>
      <el-button type="primary" @click="genDialog.visible = true">批量生成卡密</el-button>
    </h2>

    <el-form :inline="true" style="margin-bottom: 16px;">
      <el-form-item label="等级">
        <el-select v-model="search.tier" placeholder="全部" clearable style="width: 140px;">
          <el-option label="高级版 (PRO)" value="PRO" />
          <el-option label="顶级版 (PLUS)" value="PLUS" />
          <el-option label="超能版 (ULTIMATE)" value="ULTIMATE" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="search.status" placeholder="全部" clearable style="width: 140px;">
          <el-option label="未使用" value="UNUSED" />
          <el-option label="已使用" value="USED" />
          <el-option label="已作废" value="REVOKED" />
        </el-select>
      </el-form-item>
      <el-form-item label="批次">
        <el-input v-model="search.batchId" placeholder="按批次 ID 搜索" clearable @keyup.enter="handleSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <BaseTable ref="tableRef" :columns="columns" :request="fetchCards" :params="search" :page-size-default="20">
      <template #tier="{ row }">
        <el-tag :type="TIER_TAG_TYPE[row.tier] || 'info'">{{ TIER_LABEL[row.tier] || row.tier }}</el-tag>
      </template>
      <template #duration="{ row }">
        <el-tag :type="row.duration === 'PERMANENT' ? 'success' : 'warning'" effect="plain">
          {{ DURATION_LABEL[row.duration] || row.duration }}
        </el-tag>
      </template>
      <template #status="{ row }">
        <el-tag :type="STATUS_TAG_TYPE[row.status] || 'info'">{{ STATUS_LABEL[row.status] || row.status }}</el-tag>
      </template>
      <template #usedBy="{ row }">
        <span v-if="row.usedBy">{{ row.usedBy.username }}</span>
        <span v-else style="color: #c0c4cc;">—</span>
      </template>
      <template #action="{ row }">
        <el-button size="small" @click="copyCode(row.code)">复制</el-button>
        <el-button
          v-if="row.status === 'UNUSED'"
          size="small"
          type="danger"
          @click="revoke(row)"
        >作废</el-button>
      </template>
    </BaseTable>

    <!-- 生成卡密弹窗 -->
    <el-dialog v-model="genDialog.visible" title="批量生成卡密" width="520px" @close="closeGenDialog">
      <div v-if="!showResult">
        <el-form label-width="100px">
          <el-form-item label="等级">
            <el-select v-model="genDialog.tier" style="width: 260px;">
              <el-option label="高级版 (PRO)" value="PRO" />
              <el-option label="顶级版 (PLUS)" value="PLUS" />
              <el-option label="超能版 (ULTIMATE)" value="ULTIMATE" />
            </el-select>
          </el-form-item>
          <el-form-item label="时长">
            <el-radio-group v-model="genDialog.duration">
              <el-radio value="PERMANENT">永久买断</el-radio>
              <el-radio value="ANNUAL">年费（365 天）</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="数量">
            <el-input-number v-model="genDialog.count" :min="1" :max="1000" style="width: 260px;" />
          </el-form-item>
          <el-form-item label="卡密到期">
            <el-date-picker
              v-model="genDialog.expiresAt"
              type="date"
              placeholder="留空则卡密长期有效"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              style="width: 260px;"
            />
            <div style="color: #909399; font-size: 12px; margin-top: 4px;">卡密本身的过期时间，未填则长期有效</div>
          </el-form-item>
        </el-form>
      </div>
      <div v-else style="display: flex; flex-direction: column; gap: 12px;">
        <el-alert type="success" :closable="false" show-icon>
          已生成 {{ genResult?.codes.length }} 张卡密，批次：{{ genResult?.batchId }}
        </el-alert>
        <div style="max-height: 280px; overflow-y: auto; background: #f5f7fa; padding: 12px; border-radius: 4px;">
          <div v-for="(code, i) in genResult?.codes" :key="i" style="font-family: monospace; padding: 4px 0;">
            {{ code }}
          </div>
        </div>
      </div>
      <template #footer>
        <template v-if="!showResult">
          <el-button @click="genDialog.visible = false">取消</el-button>
          <el-button type="primary" :loading="genDialog.loading" @click="submitGenerate">生成</el-button>
        </template>
        <template v-else>
          <el-button @click="closeGenDialog">关闭</el-button>
          <el-button type="primary" @click="copyAllCodes">复制全部</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>
