<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import {
  User,
  MagicStick,
  Delete,
  CopyDocument,
  Edit,
  Check,
  Close,
  Promotion,
  VideoPause,
} from '@element-plus/icons-vue'
import { BubbleList } from 'vue-element-plus-x'
import type { BubbleListItemProps } from 'vue-element-plus-x/types/BubbleList'
import { useAuthStore } from '@/stores/auth'
import { confirm } from '@/utils/sweetalert'
import MarkdownView from './MarkdownView.vue'
import type { ParsedConversation, ParsedMessage } from '@/types'

interface ChatBubble extends BubbleListItemProps {
  key: string
  /** 对应 messages 的下标；-1 表示流式生成中的占位气泡 */
  msgIndex: number
  role: 'USER' | 'ASSISTANT'
  content: string
  model: string | null
  insertedAt: string
}

const props = defineProps<{
  conversation: ParsedConversation | null
  apiKeys: Array<{ id: number; name: string }>
}>()

const authStore = useAuthStore()

const messages = ref<ParsedMessage[]>([])
const selectedKeyId = ref<number | null>(null)
const selectedModel = ref<string>('deepseek-chat')
const inputText = ref('')
const streaming = ref(false)
const streamingContent = ref('')
const editingIndex = ref<number | null>(null)
const editText = ref('')

let abortController: AbortController | null = null

/** 只读模式：apiKeys 为空（如分享页查看），隐藏输入区与编辑入口 */
const readonly = computed(() => props.apiKeys.length === 0)

const keyOptions = computed(() =>
  props.apiKeys.map((k) => ({ label: k.name, value: k.id })),
)

const modelOptions = [
  { label: 'deepseek-chat', value: 'deepseek-chat' },
  { label: 'deepseek-reasoner', value: 'deepseek-reasoner' },
]

watch(
  () => props.conversation,
  (conv) => {
    messages.value = conv ? [...conv.messages] : []
    editingIndex.value = null
    editText.value = ''
    streaming.value = false
    streamingContent.value = ''
    abortController?.abort()
    abortController = null
  },
  { immediate: true },
)

/** 消息列表 → 气泡列表（流式时在末尾追加占位气泡） */
const bubbleItems = computed<ChatBubble[]>(() => {
  const items: ChatBubble[] = messages.value.map((m, index) => ({
    key: m.nodeId,
    msgIndex: index,
    role: m.role,
    content: m.content,
    model: m.model,
    insertedAt: m.insertedAt,
    placement: m.role === 'USER' ? 'end' : 'start',
    variant: 'filled',
    maxWidth: '85%',
  }))
  if (streaming.value) {
    items.push({
      key: '__streaming__',
      msgIndex: -1,
      role: 'ASSISTANT',
      content: streamingContent.value,
      model: selectedModel.value,
      insertedAt: '',
      placement: 'start',
      variant: 'filled',
      maxWidth: '85%',
      loading: !streamingContent.value,
    })
  }
  return items
})

const canSend = computed(
  () =>
    !streaming.value &&
    inputText.value.trim().length > 0 &&
    selectedKeyId.value != null,
)

function toPayload(msgs: ParsedMessage[]) {
  return msgs.map((m) => ({ role: m.role.toLowerCase(), content: m.content }))
}

/** 流式请求：POST /api/chat（Bearer 鉴权）+ SSE 解析（data: ... / [DONE]） */
async function runStream(payload: Array<{ role: string; content: string }>) {
  streaming.value = true
  streamingContent.value = ''
  abortController = new AbortController()
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({
        keyId: selectedKeyId.value,
        model: selectedModel.value,
        messages: payload,
      }),
      signal: abortController.signal,
    })
    if (!response.body) throw new Error('No stream body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let stopped = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          stopped = true
          break
        }
        try {
          const parsed = JSON.parse(data) as {
            error?: string
            choices?: Array<{ delta?: { content?: string } }>
          }
          if (parsed.error) {
            console.error(parsed.error)
            ElMessage.error(String(parsed.error))
            stopped = true
            break
          }
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) streamingContent.value += delta
        } catch {
          /* ignore */
        }
      }
      if (stopped) break
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      console.error(err)
      ElMessage.error('请求失败，请检查网络或 API Key')
    }
  } finally {
    streaming.value = false
    abortController = null
  }
}

function stopStream() {
  abortController?.abort()
}

function makeAssistant(): ParsedMessage {
  return {
    nodeId: `stream-${Date.now()}`,
    parentId: null,
    role: 'ASSISTANT',
    model: selectedModel.value,
    content: streamingContent.value,
    insertedAt: new Date().toISOString(),
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return
  if (selectedKeyId.value == null) {
    ElMessage.warning('请先选择一个 API Key')
    return
  }
  messages.value.push({
    nodeId: `user-${Date.now()}`,
    parentId: null,
    role: 'USER',
    model: null,
    content: text,
    insertedAt: new Date().toISOString(),
  })
  inputText.value = ''
  await runStream(toPayload(messages.value))
  messages.value.push(makeAssistant())
}

function startEdit(index: number) {
  if (streaming.value) return
  const m = messages.value[index]
  if (!m) return
  editingIndex.value = index
  editText.value = m.content
}

function cancelEdit() {
  editingIndex.value = null
  editText.value = ''
}

async function saveEdit() {
  if (editingIndex.value == null) return
  const idx = editingIndex.value
  const editedText = editText.value.trim()
  if (!editedText || streaming.value) return
  messages.value = messages.value.slice(0, idx)
  messages.value.push({
    nodeId: `user-edit-${Date.now()}`,
    parentId: null,
    role: 'USER',
    model: null,
    content: editedText,
    insertedAt: new Date().toISOString(),
  })
  editingIndex.value = null
  editText.value = ''
  await runStream(toPayload(messages.value))
  messages.value.push(makeAssistant())
}

async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function clearMessages() {
  if (streaming.value) stopStream()
  const ok = await confirm('清空当前对话？', '仅清空当前视图中的消息，不会影响原始数据。')
  if (!ok) return
  cancelEdit()
  streamingContent.value = ''
  messages.value = []
}
</script>

<template>
  <div class="chat-viewer">
    <!-- ============ 空状态 ============ -->
    <div v-if="!conversation" class="empty-state">
      <el-empty description="选择一个对话开始">
        <template #description>
          <p class="empty-title">选择一个对话开始</p>
          <p class="empty-sub">
            在左侧面板中选择一条会话，<br />
            查看历史消息并支持继续对话
          </p>
        </template>
      </el-empty>
    </div>

    <!-- ============ 有对话 ============ -->
    <template v-else>
      <!-- 顶部标题栏 -->
      <div class="chat-header">
        <div class="chat-title-wrap">
          <div class="chat-avatar">
            <el-icon :size="16"><MagicStick /></el-icon>
          </div>
          <div class="chat-title-text">
            <div class="chat-title">{{ conversation.title }}</div>
            <div class="chat-meta">
              <el-tag size="small" round>{{ messages.length }} 条消息</el-tag>
              <span class="chat-date">
                {{ dayjs(conversation.insertedAt).format('YYYY-MM-DD HH:mm') }}
              </span>
            </div>
          </div>
        </div>
        <el-tooltip content="清空当前对话" placement="top">
          <el-button :icon="Delete" circle text :disabled="messages.length === 0" @click="clearMessages" />
        </el-tooltip>
      </div>

      <!-- 消息流（BubbleList 自带滚动与流式跟随） -->
      <div class="chat-thread">
        <BubbleList :list="bubbleItems" item-key="key" auto-scroll class="bubble-list">
          <template #avatar="{ item }">
            <el-avatar
              :size="32"
              shape="square"
              :class="item.role === 'USER' ? 'avatar-user' : 'avatar-ai'"
            >
              <el-icon><component :is="item.role === 'USER' ? User : MagicStick" /></el-icon>
            </el-avatar>
          </template>

          <template #header="{ item }">
            <div v-if="item.role === 'ASSISTANT'" class="bubble-header">
              <span class="role-name">Deepseek AI</span>
              <el-tag v-if="item.model" size="small" effect="plain" round>{{ item.model }}</el-tag>
              <span v-if="item.msgIndex < 0" class="streaming-tag">生成中…</span>
            </div>
          </template>

          <template #content="{ item }">
            <!-- 编辑态 -->
            <div v-if="item.msgIndex >= 0 && editingIndex === item.msgIndex" class="edit-wrap">
              <el-input
                v-model="editText"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 8 }"
              />
              <div class="edit-actions">
                <el-button
                  size="small"
                  type="primary"
                  :icon="Check"
                  :loading="streaming"
                  @click="saveEdit"
                >
                  保存并重新生成
                </el-button>
                <el-button size="small" :icon="Close" @click="cancelEdit">取消</el-button>
              </div>
            </div>

            <!-- 展示态：Markdown 渲染 -->
            <template v-else>
              <MarkdownView :content="item.content" />
              <span v-if="item.msgIndex < 0" class="caret-blink" />
            </template>
          </template>

          <template #footer="{ item }">
            <div class="bubble-footer">
              <span v-if="item.insertedAt" class="msg-time">
                {{ dayjs(item.insertedAt).format('MM-DD HH:mm:ss') }}
              </span>
              <template v-if="item.msgIndex >= 0">
                <el-button
                  link
                  size="small"
                  :icon="CopyDocument"
                  @click="copyMessage(item.content)"
                >
                  复制
                </el-button>
                <el-button
                  v-if="item.role === 'USER' && !readonly"
                  link
                  size="small"
                  type="primary"
                  :icon="Edit"
                  :disabled="streaming"
                  @click="startEdit(item.msgIndex)"
                >
                  编辑
                </el-button>
              </template>
            </div>
          </template>
        </BubbleList>
      </div>

      <!-- 底部控制 + 输入区（apiKeys 为空时隐藏：只读查看） -->
      <div v-if="!readonly" class="chat-input-area">
        <div class="composer-toolbar">
          <span class="toolbar-label">继续对话</span>
          <div class="toolbar-selects">
            <el-select v-model="selectedModel" style="width: 170px">
              <el-option
                v-for="opt in modelOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="selectedKeyId" placeholder="选择 API Key" style="width: 190px">
              <el-option
                v-for="k in keyOptions"
                :key="k.value"
                :label="k.label"
                :value="k.value"
              />
            </el-select>
          </div>
        </div>

        <div class="composer-input-wrap">
          <el-input
            v-model="inputText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 5 }"
            placeholder="输入消息继续对话…（Enter 发送，Shift+Enter 换行）"
            resize="none"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <el-button
            v-if="streaming"
            type="danger"
            plain
            :icon="VideoPause"
            @click="stopStream"
          >
            停止
          </el-button>
          <el-button
            v-else
            type="primary"
            :icon="Promotion"
            :disabled="!canSend"
            @click="sendMessage"
          >
            发送
          </el-button>
        </div>

        <div v-if="selectedKeyId == null" class="composer-hint">
          请先选择一个 API Key，才能继续对话
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* ============ 空状态 ============ */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.empty-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

/* ============ 顶部标题栏 ============ */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.chat-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.chat-avatar {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.chat-title-text {
  min-width: 0;
}
.chat-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}
.chat-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ============ 消息流 ============ */
.chat-thread {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
}
.bubble-list {
  flex: 1;
  min-height: 0;
  padding: 16px;
}

/* 用户气泡使用主题色底（EP 变量，暗色自动适配） */
.bubble-list :deep(.elx-bubble--end .elx-bubble__content) {
  --elx-bubble-bg: var(--el-color-primary-light-8);
}

/* 头像 */
.bubble-list :deep(.avatar-ai) {
  background: var(--el-color-primary);
  color: var(--el-color-white);
}
.bubble-list :deep(.avatar-user) {
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-regular);
}

/* AI 气泡头：角色名 + 模型标签 */
.bubble-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.role-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.streaming-tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  animation: breathe 1.6s ease-in-out infinite;
}
@keyframes breathe {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

/* 流式光标 */
.caret-blink {
  display: inline-block;
  width: 2px;
  height: 14px;
  margin-left: 4px;
  vertical-align: text-bottom;
  border-radius: 1px;
  background: var(--el-color-primary);
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* 气泡脚注：时间 + 操作 */
.bubble-footer {
  display: flex;
  align-items: center;
  gap: 4px;
}
.msg-time {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}

/* 编辑面板 */
.edit-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 260px;
}
.edit-actions {
  display: flex;
  gap: 8px;
}

/* ============ 底部输入 ============ */
.chat-input-area {
  padding: 12px 16px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  flex-shrink: 0;
}
.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.toolbar-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.04em;
}
.toolbar-selects {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.composer-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.composer-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}

@media (max-width: 640px) {
  .bubble-list {
    padding: 12px;
  }
  .chat-input-area {
    padding: 10px 12px 12px;
  }
}
</style>
