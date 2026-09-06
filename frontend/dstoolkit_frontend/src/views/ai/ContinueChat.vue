<script setup lang="ts">
/**
 * 续聊页 - DeepSeek 内置模型
 *  - 对话列表 + 新建对话
 *  - SSE 流式对话
 *  - 每小时限流提示
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, ChatDotRound, Promotion, Loading } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { ssePost } from '@/utils/sse'
import MarkdownView from '@/components/MarkdownView.vue'
import type { UnifiedConversation, UnifiedMessage } from '@/types'

const conversations = ref<UnifiedConversation[]>([])
const activeId = ref<number | null>(null)
const messages = ref<UnifiedMessage[]>([])
const input = ref('')
const sending = ref(false)
const loadingList = ref(false)
const loadingConv = ref(false)
const model = ref<'deepseek-chat' | 'deepseek-reasoner'>('deepseek-chat')

const activeConv = computed(() => conversations.value.find((c) => c.id === activeId.value) || null)

async function loadList() {
  loadingList.value = true
  try {
    const res: any = await request.get('/continue-chat', { params: { pageSize: 100 } })
    conversations.value = res.conversations || []
  } catch {
    // ignore
  } finally {
    loadingList.value = false
  }
}

async function createConversation() {
  const title = input.value.trim().slice(0, 30) || '新对话'
  try {
    const res: any = await request.post('/continue-chat', {
      title,
      messages: [{ role: 'user', content: input.value.trim() }],
      model: model.value,
    })
    activeId.value = res.conversation.id
    conversations.value.unshift(res.conversation)
    input.value = ''
    loadConversation(res.conversation.id)
  } catch {
    // ignore
  }
}

async function loadConversation(id: number) {
  activeId.value = id
  loadingConv.value = true
  try {
    const res: any = await request.get(`/continue-chat/${id}`)
    messages.value = res.conversation?.messages || []
  } catch {
    // ignore
  } finally {
    loadingConv.value = false
  }
}

async function sendMessage() {
  const content = input.value.trim()
  if (!content || sending.value || !activeId.value) return

  sending.value = true
  input.value = ''
  // 乐观追加用户消息
  const userMsg: UnifiedMessage = {
    id: Date.now(),
    conversationId: activeId.value,
    role: 'USER',
    content,
    insertedAt: new Date().toISOString(),
  }
  messages.value.push(userMsg)
  // 占位 AI 消息
  const aiMsg: UnifiedMessage = {
    id: Date.now() + 1,
    conversationId: activeId.value,
    role: 'ASSISTANT',
    content: '',
    insertedAt: new Date().toISOString(),
  }
  messages.value.push(aiMsg)

  await ssePost(`/continue-chat/${activeId.value}/message`, { content, model: model.value }, {
    onDelta: (delta) => {
      aiMsg.content += delta
    },
    onDone: () => {
      sending.value = false
    },
    onError: (e) => {
      aiMsg.content = `❌ ${e.message}`
      sending.value = false
      ElMessage.error(e.message)
    },
  })
}

function onEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

onMounted(loadList)
</script>

<template>
  <div class="continue-chat-page">
    <!-- 对话列表侧栏 -->
    <div class="sidebar">
      <el-button type="primary" class="new-btn" :icon="Plus" @click="createConversation">
        新建对话
      </el-button>
      <div class="conv-list" v-loading="loadingList">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === activeId }"
          @click="loadConversation(conv.id)"
        >
          <el-icon><ChatDotRound /></el-icon>
          <span class="conv-title">{{ conv.title }}</span>
          <span class="conv-turns">{{ conv.turnCount }} 轮</span>
        </div>
        <el-empty v-if="conversations.length === 0" description="暂无对话" :image-size="80" />
      </div>
    </div>

    <!-- 对话区 -->
    <div class="chat-area">
      <div class="chat-header">
        <span class="chat-title">{{ activeConv?.title || '选择或新建对话' }}</span>
        <el-select v-model="model" size="small" style="width: 160px">
          <el-option label="DeepSeek Chat" value="deepseek-chat" />
          <el-option label="DeepSeek Reasoner" value="deepseek-reasoner" />
        </el-select>
      </div>

      <div class="messages" v-loading="loadingConv">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message"
          :class="msg.role.toLowerCase()"
        >
          <div class="msg-bubble">
            <div class="msg-role">{{ msg.role === 'USER' ? '我' : 'AI' }}</div>
            <MarkdownView v-if="msg.content" :content="msg.content" />
            <span v-else class="typing">思考中...</span>
          </div>
        </div>
      </div>

      <div class="input-area">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          :disabled="!activeId || sending"
          @keydown="onEnter"
        />
        <el-button
          type="primary"
          :icon="sending ? Loading : Promotion"
          :disabled="!input.trim() || !activeId || sending"
          @click="sendMessage"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.continue-chat-page {
  display: flex;
  height: calc(100vh - 140px);
  height: calc(100dvh - 140px);
  gap: 16px;
}
.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.new-btn {
  width: 100%;
}
.conv-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
.conv-item:hover {
  background: var(--el-fill-color);
}
.conv-item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.conv-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}
.conv-turns {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.chat-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
  overflow: hidden;
}
.chat-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chat-title {
  font-weight: 600;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.message {
  display: flex;
}
.message.user {
  justify-content: flex-end;
}
.msg-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
}
.message.user .msg-bubble {
  background: var(--el-color-primary);
  color: #fff;
}
.msg-role {
  font-size: 11px;
  opacity: 0.7;
  margin-bottom: 4px;
}
.typing {
  color: var(--el-text-color-secondary);
  font-style: italic;
}
.input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.input-area :deep(.el-textarea) {
  flex: 1;
}
@media (max-width: 768px) {
  .continue-chat-page {
    flex-direction: column;
    height: auto;
    gap: 12px;
  }
  .sidebar {
    width: 100%;
    max-height: 180px;
  }
  .chat-area {
    height: 62vh;
    height: 62dvh;
  }
  .messages {
    padding: 12px;
  }
  .msg-bubble {
    max-width: 88%;
  }
  .input-area {
    padding: 10px 12px;
  }
}
@media (max-width: 480px) {
  .input-area {
    flex-direction: column;
    align-items: stretch;
  }
  .input-area .el-button {
    width: 100%;
  }
}
</style>
