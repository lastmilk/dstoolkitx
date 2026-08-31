<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    total: number
    currentPage: number
    pageSize: number
    pageSizes?: number[]
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
  },
)

const emits = defineEmits<{
  'update:currentPage': [val: number]
  'update:pageSize': [val: number]
  change: []
}>()

function onPageChange(val: number) {
  emits('update:currentPage', val)
  emits('change')
}

function onSizeChange(val: number) {
  emits('update:pageSize', val)
  // 切换条数时回到第一页，避免越界空页
  emits('update:currentPage', 1)
  emits('change')
}
</script>

<template>
  <div class="base-pagination">
    <el-pagination
      :current-page="props.currentPage"
      :page-size="props.pageSize"
      :page-sizes="props.pageSizes"
      :total="props.total"
      background
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="onPageChange"
      @size-change="onSizeChange"
    />
  </div>
</template>

<style scoped>
.base-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
