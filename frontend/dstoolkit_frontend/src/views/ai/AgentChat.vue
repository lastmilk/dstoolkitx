<script setup lang="ts">
/**
 * Agent 续聊页 - StepFun 内置模型 + MCP + Skill.md
 *  - 对话列表 + 新建对话
 *  - SSE 流式对话，消耗 AI 积分
 *  - 显示已启用的 Skills / MCP 数量
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, ChatDotRound, Promotion, Loading, Cpu, Connection } from '@element-plus/icons-vue'
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
const model = ref<'step-1o' | 'step-1o-flash' | 'step-1v'>('step-1o')
const skillCount = ref(0)
const mcpCount = ref(0)
const balance = ref(0)

const activeConv = computed(() => conversations.value.find((c) => c.id === activeId.value) || null)

async function loadList() {
  loadingList.value = true
  try {
    const [convRes, skillRes, mcpRes]: any[] = await Promise.all([
      request.get('/agent', { params: { pageSize: 100 } }),
      request.get('/skills'),
      request.get('/mcp'),
    ])
    conversations.value = convRes.conversations || []
    skillCount.value = (skillRes.skills || []).filter((s: any) => s.enabled).length
    mcpCount.value = (mcpRes.servers || []).filter((s: any) => s.enabled).length
  } catch {
    // ignore
  } finally {
    loadingList.value = false
  }
}

async function createConversation() {
  const title = input.value.trim().slice(0, 30) || '新 Agent 对话'
  try {
    const res: any = await request.post('/agent', {
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
    const res: any = await request.get(`/agent/${id}`)
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
  const userMsg: UnifiedMessage = {
    id: Date.now(),
    conversationId: activeId.value,
    role: 'USER',
    content,
    insertedAt: new Date().toISOString(),
  }
  messages.value.push(userMsg)
  const aiMsg: UnifiedMessage = {
    id: Date.now() + 1,
    conversationId: activeId.value,
    role: 'ASSISTANT',
    content: '',
    insertedAt: new Date().toISOString(),
  }
  messages.value.push(aiMsg)

  await ssePost(`/agent/${activeId.value}/message`, { content, model: model.value }, {
    onDelta: (delta) => {
      aiMsg.content += delta
    },
    onDone: (data) => {
      sending.value = false
      if (typeof data.balance === 'number') balance.value = data.balance
      if (data.toolCalls) {
        ElMessage.info(`Agent 调用了 ${data.toolCalls} 次工具`)
      }
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
  <div class="agent-page">
    <!-- 对话列表侧栏 -->
    <div class="sidebar">
      <el-button type="primary" class="new-btn" :icon="Plus" @click="createConversation">
        新建 Agent 对话
      </el-button>
      <div class="capability-row">
        <el-tag :icon="Cpu" type="success" size="small">{{ skillCount }} 技能</el-tag>
        <el-tag :icon="Connection" type="warning" size="small">{{ mcpCount }} MCP</el-tag>
      </div>
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
        <span class="chat-title">{{ activeConv?.title || '选择或新建 Agent 对话' }}</span>
        <el-select v-model="model" size="small" class="model-select">
          <el-option label="Step-1o" value="step-1o" />
          <el-option label="Step-1o Flash" value="step-1o-flash" />
          <el-option label="Step-1v" value="step-1v" />
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
            <div class="msg-role">{{ msg.role === 'USER' ? '我' : 'Agent' }}</div>
            <MarkdownView v-if="msg.content" :content="msg.content" />
            <span v-else class="typing">思考中（可能正在调用工具）...</span>
          </div>
        </div>
      </div>

      <div class="input-area">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          placeholder="Agent 可使用你的 Skills 和 MCP 工具，Enter 发送"
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
.agent-page {
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
.capability-row {
  display: flex;
  gap: 8px;
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
  gap: 12px;
}
.chat-title {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-select {
  width: 160px;
  flex-shrink: 0;
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
  .agent-page {
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
  .chat-header {
    padding: 10px 12px;
  }
  .model-select {
    width: 130px;
  }
  .messages {
    padding: 12px;
  }
  .msg-bubble {
    max-width: 88%;
  }
  .input-area {
    padding: 10px 12px;
    gap: 8px;
  }
}
@media (max-width: 480px) {
  .chat-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .model-select {
    width: 100%;
  }
  .input-area {
    flex-direction: column;
    align-items: stretch;
  }
  .input-area .el-button {
    width: 100%;
  }
}
</style>
