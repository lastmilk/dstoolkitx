<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ content: string }>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="markdown-body" v-html="html"></div>
</template>

<style scoped>
.markdown-body {
  font-size: 14px;
  line-height: 1.75;
  word-break: break-word;
}

.markdown-body :deep(p) {
  margin: 0 0 10px;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 16px 0 8px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--el-text-color-primary);
}
.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}
.markdown-body :deep(li) {
  margin: 2px 0;
}

.markdown-body :deep(blockquote) {
  margin: 10px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
}
.markdown-body :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

/* 行内代码 */
.markdown-body :deep(code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  color: var(--el-color-primary);
  font-size: 0.9em;
  font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
}

/* 代码块容器：亮色保留 hljs 深色主题；暗色下容器与 EP 背景融合 */
.markdown-body :deep(pre.hljs) {
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  overflow-x: auto;
}
.markdown-body :deep(pre.hljs code) {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: 13px;
}
html.dark .markdown-body :deep(pre.hljs) {
  background: var(--el-bg-color);
  border-color: var(--el-border-color);
}

.markdown-body :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}
.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  margin: 10px 0;
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
  max-width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 6px 12px;
  font-size: 13px;
}
.markdown-body :deep(th) {
  background: var(--el-fill-color-light);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.markdown-body :deep(hr) {
  margin: 14px 0;
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

/* KaTeX 公式：颜色继承文本色（暗色自动适配），横向滚动防溢出 */
.markdown-body :deep(.katex) {
  color: inherit;
  font-size: 1.05em;
}
.markdown-body :deep(.katex-display) {
  margin: 10px 0;
  padding: 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
