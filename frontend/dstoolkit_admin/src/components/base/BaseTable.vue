<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import BasePagination from './BasePagination.vue'
import type { ColumnPreset, BaseTableColumn } from './types'

interface PageResult {
  records: any[]
  total: number
}

/**
 * 列类型预设：参考 https://www.cnblogs.com/gccbuaa/p/19484120
 * type 仅用于推导 width/align/tooltip，不会透传给 el-table-column 的原生 type
 */
const COLUMN_PRESET: Record<string, ColumnPreset> = {
  index: { width: 70, align: 'center' },
  action: { width: 180, align: 'center' },
  short: { width: 100, align: 'left' },
  normal: { minWidth: 140, align: 'left' },
  long: { minWidth: 220, align: 'left', showOverflowTooltip: true },
  time: { width: 180, align: 'center' },
  status: { width: 90, align: 'center' },
}

const props = withDefaults(
  defineProps<{
    columns: BaseTableColumn[]
    /** 统一分页请求函数：接收 { page, pageSize, ...params }，返回 { records, total } */
    request: (params: { page: number; pageSize: number; [k: string]: any }) => Promise<PageResult>
    /** 外部查询参数，变化时自动回到第 1 页并重新请求 */
    params?: Record<string, any>
    pageSizeDefault?: number
    border?: boolean
  }>(),
  {
    params: () => ({}),
    pageSizeDefault: 10,
    border: true,
  },
)

const tableData = ref<any[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(props.pageSizeDefault)

/** 合并列预设 + 用户配置，并剔除自定义字段（type/slot 不透传给 el-table-column） */
function resolveBinding(col: BaseTableColumn) {
  const preset: ColumnPreset = col.type ? COLUMN_PRESET[col.type] : {}
  const { type: _omitType, slot: _omitSlot, ...rest } = col
  return { ...preset, ...rest }
}

async function fetchList() {
  if (!props.request) return
  loading.value = true
  try {
    const res = await props.request({
      page: page.value,
      pageSize: pageSize.value,
      ...props.params,
    })
    tableData.value = res?.records ?? []
    total.value = res?.total ?? 0
  } finally {
    loading.value = false
  }
}

onMounted(fetchList)

watch(
  () => props.params,
  () => {
    page.value = 1
    fetchList()
  },
  { deep: true },
)

defineExpose({ fetchList })
</script>

<template>
  <div class="base-table">
    <el-table v-loading="loading" :data="tableData" :border="border" style="width: 100%">
      <el-table-column
        v-for="col in columns"
        :key="col.prop || col.slot || col.label"
        v-bind="resolveBinding(col)"
      >
        <template v-if="col.slot" #default="scope">
          <slot :name="col.slot" v-bind="scope" />
        </template>
      </el-table-column>
    </el-table>
    <BasePagination
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @update:current-page="page = $event"
      @update:page-size="pageSize = $event"
      @change="fetchList"
    />
  </div>
</template>
