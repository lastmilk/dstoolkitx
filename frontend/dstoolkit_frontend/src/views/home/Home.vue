<script setup lang="ts">
/**
 * 首页 - 统一 AI 对话工作台
 *  - 无 Tab 栏：单一对话界面
 *  - 模型选择器（唯一必选）：DeepSeek / StepFun
 *  - Agent 开关：启用后切换为 StepFun 模型 + 工具调用，显示常见场景预设
 *  - 知识库开关：启用后对话携带知识库标记（引用已导入对话）
 *  - 对话侧栏 + 流式聊天区
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Plus, ChatDotRound, Promotion, Loading, Cpu, Connection,
  Collection, MagicStick, EditPen, DataLine,
} from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { ssePost } from '@/utils/sse'
import MarkdownView from '@/components/MarkdownView.vue'
import type { UnifiedConversation, UnifiedMessage } from '@/types'

// ═══════════════════════════════════════════════════
// 模式与模型
// ═══════════════════════════════════════════════════
type AiModel = 'deepseek-chat' | 'deepseek-reasoner'
type AgentModel = 'step-1o' | 'step-1o-flash' | 'step-1v'
type Model = AiModel | AgentModel

const agentEnabled = ref(false)
const knowledgeBase = ref(false)
const model = ref<Model>('deepseek-chat')

// 模型选项随 Agent 开关切换
const modelOptions = computed(() => {
  if (agentEnabled.value) {
    return [
      { label: 'Step-1o', value: 'step-1o', desc: '推理强 · 多模态' },
      { label: 'Step-1o Flash', value: 'step-1o-flash', desc: '快速响应' },
      { label: 'Step-1v', value: 'step-1v', desc: '视觉理解' },
    ]
  }
  return [
    { label: 'DeepSeek Chat', value: 'deepseek-chat', desc: '通用对话' },
    { label: 'DeepSeek Reasoner', value: 'deepseek-reasoner', desc: '深度推理' },
  ]
})

// Agent 开关变化时自动切换到对应模型集的默认值
watch(agentEnabled, (on) => {
  model.value = on ? 'step-1o' : 'deepseek-chat'
  // 切换模式后重新加载对应对话列表
  activeId.value = null
  messages.value = []
  loadList()
})

const isAgentMode = computed(() => agentEnabled.value)

// ═══════════════════════════════════════════════════
// Agent 常见场景预设
// ═══════════════════════════════════════════════════
interface Scenario {
  icon: any
  label: string
  prompt: string
}
const scenarios: Scenario[] = [
  { icon: EditPen, label: '代码审查', prompt: '请审查以下代码，指出潜在 bug、性能问题和改进建议，并给出优化后的代码：\n\n```\n// 在此粘贴你的代码\n```' },
  { icon: Promotion, label: '翻译润色', prompt: '请将以下内容翻译为英文并润色表达，保持原意：\n\n' },
  { icon: MagicStick, label: '总结摘要', prompt: '请总结以下内容的要点，用分条列表输出，每条不超过 30 字：\n\n' },
  { icon: Collection, label: '文案写作', prompt: '请帮我写一段产品文案，要求：吸引眼球、突出卖点、适合社交媒体传播。产品信息：\n\n' },
  { icon: ChatDotRound, label: '头脑风暴', prompt: '请围绕以下主题进行头脑风暴，给出 10 个创意方向并简要说明：\n\n主题：' },
  { icon: DataLine, label: '数据分析', prompt: '请分析以下数据，给出趋势洞察、异常点和建议（可用表格呈现）：\n\n```\n// 在此粘贴数据\n```' },
  { icon: Cpu, label: '学习辅导', prompt: '请用通俗易懂的方式讲解以下概念，结合例子说明，最后出 3 道练习题检验理解：\n\n概念：' },
  { icon: Connection, label: '邮件撰写', prompt: '请帮我写一封邮件，语气专业得体。邮件目的与背景：\n\n' },
]
function applyScenario(s: Scenario) {
  input.value = s.prompt
}

// ═══════════════════════════════════════════════════
// 对话与消息
// ═══════════════════════════════════════════════════
const conversations = ref<UnifiedConversation[]>([])
const activeId = ref<number | null>(null)
const messages = ref<UnifiedMessage[]>([])
const input = ref('')
const sending = ref(false)
const loadingList = ref(false)
const loadingConv = ref(false)
const skillCount = ref(0)
const mcpCount = ref(0)
const agentBalance = ref(0)

const activeConv = computed(() =>
  conversations.value.find((c) => c.id === activeId.value) || null,
)

// 过滤掉 SYSTEM 占位消息，UI 只展示 USER / ASSISTANT
const displayMessages = computed(() =>
  messages.value.filter((m) => m.role !== 'SYSTEM'),
)

const endpoint = computed(() => (isAgentMode.value ? '/agent' : '/continue-chat'))

async function loadList() {
  loadingList.value = true
  try {
    const res: any = await request.get(endpoint.value, { params: { pageSize: 100 } })
    conversations.value = res.conversations || []
    if (isAgentMode.value) {
      const [skillRes, mcpRes]: any[] = await Promise.all([
        request.get('/skills'),
        request.get('/mcp'),
      ])
      skillCount.value = (skillRes.skills || []).filter((s: any) => s.enabled).length
      mcpCount.value = (mcpRes.servers || []).filter((s: any) => s.enabled).length
    }
  } catch {
    /* ignore */
  } finally {
    loadingList.value = false
  }
}

async function createConversation() {
  const content = input.value.trim()
  if (!content) {
    ElMessage.warning('请先输入消息内容')
    return
  }
  const title = content.slice(0, 30)
  try {
    // 用 system 占位消息创建对话（满足后端 min(1) 校验），真实消息走 SSE 流式接口
    const res: any = await request.post(endpoint.value, {
      title,
      messages: [{ role: 'system', content: title }],
      model: model.value,
    })
    activeId.value = res.conversation.id
    conversations.value.unshift(res.conversation)
    input.value = ''
    await loadConversation(res.conversation.id)
    // 创建后立即通过消息接口发送首条用户消息，获取 AI 流式回复
    await sendMessage(content)
  } catch {
    /* ignore */
  }
}

async function loadConversation(id: number) {
  activeId.value = id
  loadingConv.value = true
  try {
    const res: any = await request.get(`${endpoint.value}/${id}`)
    messages.value = res.conversation?.messages || []
  } catch {
    /* ignore */
  } finally {
    loadingConv.value = false
  }
}

async function sendMessage(forceContent?: string) {
  const content = (forceContent ?? input.value).trim()
  if (!content || sending.value || !activeId.value) return

  sending.value = true
  if (!forceContent) input.value = ''

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

  const body: Record<string, unknown> = { content, model: model.value }
  if (knowledgeBase.value) body.knowledgeBase = true

  await ssePost(`${endpoint.value}/${activeId.value}/message`, body, {
    onDelta: (delta) => { aiMsg.content += delta },
    onDone: (data) => {
      sending.value = false
      if (isAgentMode.value && typeof data.balance === 'number') {
        agentBalance.value = data.balance
      }
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
    if (!activeId.value && input.value.trim()) {
      createConversation()
      return
    }
    sendMessage()
  }
}

function newChat() {
  activeId.value = null
  messages.value = []
  input.value = ''
}

onMounted(loadList)
</script>

<template>
  <div class="home-page">
    <!-- ══════════ 顶部控制栏 ══════════ -->
    <div class="control-bar">
      <div class="control-left">
        <!-- 模型选择器（唯一必选） -->
        <el-select v-model="model" size="large" class="model-selector" :popper-class="'model-popper'">
          <el-option
            v-for="opt in modelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          >
            <div class="model-option">
              <span class="model-name">{{ opt.label }}</span>
              <span class="model-desc">{{ opt.desc }}</span>
            </div>
          </el-option>
          <template #prefix>
            <el-icon><Cpu /></el-icon>
          </template>
        </el-select>

        <!-- Agent 开关 -->
        <div class="toggle-item">
          <el-icon :size="16" :color="agentEnabled ? 'var(--el-color-primary)' : 'var(--el-text-color-secondary)'">
            <Connection />
          </el-icon>
          <span class="toggle-label">Agent</span>
          <el-switch v-model="agentEnabled" size="small" />
        </div>

        <!-- 知识库开关 -->
        <div class="toggle-item">
          <el-icon :size="16" :color="knowledgeBase ? 'var(--el-color-success)' : 'var(--el-text-color-secondary)'">
            <Collection />
          </el-icon>
          <span class="toggle-label">知识库</span>
          <el-switch v-model="knowledgeBase" size="small" />
        </div>
      </div>

      <div class="control-right">
        <el-tag v-if="isAgentMode" :icon="Cpu" type="success" size="small">{{ skillCount }} 技能</el-tag>
        <el-tag v-if="isAgentMode" :icon="Connection" type="warning" size="small">{{ mcpCount }} MCP</el-tag>
        <el-tag v-if="knowledgeBase" type="success" size="small" effect="plain">已引用知识库</el-tag>
      </div>
    </div>

    <!-- ══════════ Agent 场景预设 ══════════ -->
    <div v-if="agentEnabled" class="scenario-bar">
      <span class="scenario-title">场景预设：</span>
      <div class="scenario-list">
        <div
          v-for="s in scenarios"
          :key="s.label"
          class="scenario-chip"
          @click="applyScenario(s)"
        >
          <el-icon :size="14"><component :is="s.icon" /></el-icon>
          <span>{{ s.label }}</span>
        </div>
      </div>
    </div>

    <!-- ══════════ 主体：对话侧栏 + 聊天区 ══════════ -->
    <div class="chat-shell">
      <!-- 对话侧栏 -->
      <div class="sidebar">
        <el-button type="primary" class="new-btn" :icon="Plus" @click="newChat">
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

      <!-- 聊天区 -->
      <div class="chat-area">
        <div class="chat-header">
          <span class="chat-title">
            {{ activeConv?.title || (isAgentMode ? '开始新的 Agent 对话' : '开始新的 AI 对话') }}
          </span>
          <el-tag size="small" :type="isAgentMode ? 'warning' : 'primary'">
            {{ modelOptions.find(o => o.value === model)?.label || model }}
          </el-tag>
        </div>

        <div class="messages" v-loading="loadingConv">
          <div
            v-for="msg in displayMessages"
            :key="msg.id"
            class="message"
            :class="msg.role.toLowerCase()"
          >
            <div class="msg-bubble">
              <div class="msg-role">{{ msg.role === 'USER' ? '我' : (isAgentMode ? 'Agent' : 'AI') }}</div>
              <MarkdownView v-if="msg.content" :content="msg.content" />
              <span v-else class="typing">
                {{ isAgentMode ? '思考中（可能正在调用工具）...' : '思考中...' }}
              </span>
            </div>
          </div>
          <el-empty
            v-if="displayMessages.length === 0 && !loadingConv"
            :description="isAgentMode ? 'Agent 可使用你的 Skills 和 MCP 工具，输入消息开始' : '输入消息开始 AI 对话'"
            :image-size="100"
          />
        </div>

        <div class="input-area">
          <el-input
            v-model="input"
            type="textarea"
            :rows="2"
            :placeholder="isAgentMode
              ? 'Agent 可使用 Skills 和 MCP 工具，Enter 发送，Shift+Enter 换行'
              : '输入消息，Enter 发送，Shift+Enter 换行'"
            :disabled="sending"
            @keydown="onEnter"
          />
          <el-button
            type="primary"
            :icon="sending ? Loading : Promotion"
            :disabled="!input.trim() || sending"
            @click="activeId ? sendMessage() : createConversation()"
          >
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  height: calc(100dvh - 100px);
  gap: 12px;
}

/* ══════════ 顶部控制栏 ══════════ */
.control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.control-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.model-selector {
  width: 240px;
}
.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.model-option .model-name {
  font-weight: 600;
}
.model-option .model-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.toggle-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.control-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ══════════ 场景预设 ══════════ */
.scenario-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  overflow-x: auto;
  padding: 2px 0;
}
.scenario-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}
.scenario-list {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
}
.scenario-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 20px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
  transition: all 0.2s;
  flex-shrink: 0;
}
.scenario-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

/* ══════════ 聊天外壳 ══════════ */
.chat-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}
.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--el-bg-color);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
  padding: 12px;
}
.new-btn {
  width: 100%;
}
.conv-list {
  flex: 1;
  min-height: 0;
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
.message.user .msg-bubble :deep(.markdown-body) {
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

/* ══════════ 窄屏适配 ══════════ */
@media (max-width: 768px) {
  .home-page {
    height: auto;
    min-height: calc(100vh - 100px);
  }
  .model-selector {
    width: 180px;
  }
  .chat-shell {
    flex-direction: column;
    height: 70vh;
  }
  .sidebar {
    width: 100%;
    max-height: 160px;
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
  .chat-header {
    padding: 10px 12px;
  }
  .toggle-item {
    padding: 4px 8px;
  }
}
@media (max-width: 480px) {
  .chat-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .input-area {
    flex-direction: column;
    align-items: stretch;
  }
  .input-area .el-button {
    width: 100%;
  }
  .control-left {
    gap: 8px;
  }
}
</style>
