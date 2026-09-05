<script setup lang="ts">
/**
 * Git 对话冲突处理对话框
 *  - 逐个文件列出冲突（本地 vs 远端：轮数 / 更新时间 / 内容预览）
 *  - 每个冲突三选一：保留本地 / 保留远端 / 智能合并（按节点并集，不可合并时禁用）
 *  - 确认后通过 resolve 回调交还调用方（gitclient.resolveConflicts 完成推送）
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import type { GitConflict, ConflictResolution } from '@/utils/gitclient'
import { smartMergeConversation } from '@/utils/gitclient'

const props = defineProps<{
  visible: boolean
  conflicts: GitConflict[]
  containerName: string
  resolving?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'resolve', resolutions: Record<string, ConflictResolution>): void
  (e: 'cancel'): void
}>()

const resolutions = ref<Record<string, ConflictResolution>>({})
const previewPath = ref<string>('')
const previewSide = ref<'local' | 'remote'>('local')

const smartAvailable = computed<Record<string, boolean>>(() => {
  const out: Record<string, boolean> = {}
  for (const c of props.conflicts) {
    out[c.path] = smartMergeConversation(c.baseContent, c.localContent, c.remoteContent) !== null
  }
  return out
})

watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 默认：可智能合并的选智能合并，否则保留本地
      const init: Record<string, ConflictResolution> = {}
      for (const c of props.conflicts) {
        init[c.path] = smartAvailable.value[c.path] ? 'smart' : 'local'
      }
      resolutions.value = init
      previewPath.value = props.conflicts[0]?.path ?? ''
      previewSide.value = 'local'
    }
  },
  { immediate: true },
)

const previewContent = computed(() => {
  const c = props.conflicts.find((x) => x.path === previewPath.value)
  if (!c) return ''
  const raw = previewSide.value === 'local' ? c.localContent : c.remoteContent
  try {
    return JSON.stringify(JSON.parse(raw ?? ''), null, 2)
  } catch {
    return raw ?? '（该侧内容已被删除）'
  }
})

function fmtTime(iso: string): string {
  if (!iso) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : iso
}

function chooseAll(v: ConflictResolution) {
  const next: Record<string, ConflictResolution> = {}
  for (const c of props.conflicts) {
    if (v !== 'smart' || smartAvailable.value[c.path]) next[c.path] = v
  }
  resolutions.value = next
}

function confirmResolve() {
  if (props.conflicts.some((c) => !resolutions.value[c.path])) {
    ElMessage.warning('请为每个冲突选择处理方式')
    return
  }
  emit('resolve', { ...resolutions.value })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="`对话冲突 · ${containerName}`"
    width="720px"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert type="warning" :closable="false" class="conflict-tip">
      <template #title>
        本地与远端对 {{ conflicts.length }} 个对话都有修改，Git 无法自动合并。请逐个选择保留策略：
      </template>
    </el-alert>

    <div class="conflict-toolbar">
      <span class="toolbar-label">批量：</span>
      <el-button size="small" @click="chooseAll('local')">全部保留本地</el-button>
      <el-button size="small" @click="chooseAll('remote')">全部保留远端</el-button>
      <el-button size="small" @click="chooseAll('smart')">全部智能合并</el-button>
    </div>

    <div v-for="c in conflicts" :key="c.path" class="conflict-item">
      <div class="conflict-head">
        <el-icon class="conflict-icon"><Warning /></el-icon>
        <span class="conflict-title" :title="c.convId">{{ c.title }}</span>
        <el-radio-group v-model="resolutions[c.path]" size="small">
          <el-radio-button value="local">保留本地（{{ c.localSummary.turns }} 轮）</el-radio-button>
          <el-radio-button value="remote">保留远端（{{ c.remoteSummary.turns }} 轮）</el-radio-button>
          <el-radio-button value="smart" :disabled="!smartAvailable[c.path]">智能合并</el-radio-button>
        </el-radio-group>
      </div>
      <div class="conflict-meta">
        <el-tag size="small" effect="plain">本地更新：{{ fmtTime(c.localSummary.updatedAt) }}</el-tag>
        <el-tag size="small" effect="plain" type="info">远端更新：{{ fmtTime(c.remoteSummary.updatedAt) }}</el-tag>
        <el-button
          link
          type="primary"
          size="small"
          @click="previewPath = previewPath === c.path ? '' : c.path"
        >
          {{ previewPath === c.path ? '收起对比' : '内容对比' }}
        </el-button>
      </div>
      <div v-if="previewPath === c.path" class="conflict-diff">
        <el-radio-group v-model="previewSide" size="small" class="diff-side">
          <el-radio-button value="local">本地内容</el-radio-button>
          <el-radio-button value="remote">远端内容</el-radio-button>
        </el-radio-group>
        <pre class="diff-pre">{{ previewContent.slice(0, 4000) }}{{ previewContent.length > 4000 ? '\n…（内容过长已截断）' : '' }}</pre>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="props.resolving" @click="emit('cancel')">取消本次同步</el-button>
      <el-button type="primary" :loading="props.resolving" @click="confirmResolve">
        应用并继续推送
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.conflict-tip {
  margin-bottom: 12px;
}
.conflict-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.toolbar-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.conflict-item {
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 10px;
}
.conflict-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.conflict-icon {
  color: var(--el-color-warning);
}
.conflict-title {
  flex: 1;
  min-width: 120px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conflict-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.conflict-diff {
  margin-top: 10px;
}
.diff-side {
  margin-bottom: 6px;
}
.diff-pre {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
