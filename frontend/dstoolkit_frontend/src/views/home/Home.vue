<script setup lang="ts">
/**
 * 首页 - 统一 AI 工作台
 *  - 顶部 4 个 Tab：AI 续聊 / Agent 续聊 / 记忆试卷 / Agent 工具
 *  - 共享对话侧栏：AI 续聊显示 deepseek 对话，Agent 续聊显示 agent 对话，其余 Tab 隐藏侧栏
 *  - 对话区：AI/Agent 模式下为流式聊天，记忆试卷/Agent工具下为对应管理面板
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, ChatDotRound, Promotion, Loading, Cpu, Connection,
  MagicStick, Refresh, View, Delete, Check, Close, Document,
  Edit, Setting, EditPen,
} from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { ssePost } from '@/utils/sse'
import MarkdownView from '@/components/MarkdownView.vue'
import type {
  UnifiedConversation, UnifiedMessage, Skill, McpServer,
  TestPaper, TestPaperQuestion, QuestionType,
} from '@/types'

type HomeTab = 'continue-chat' | 'agent' | 'test-paper' | 'agent-tools'
const activeTab = ref<HomeTab>('continue-chat')

// ═══════════════════════════════════════════════════
// AI 续聊状态
// ═══════════════════════════════════════════════════
const aiConvs = ref<UnifiedConversation[]>([])
const aiActiveId = ref<number | null>(null)
const aiMessages = ref<UnifiedMessage[]>([])
const aiInput = ref('')
const aiSending = ref(false)
const aiLoadingList = ref(false)
const aiLoadingConv = ref(false)
const aiModel = ref<'deepseek-chat' | 'deepseek-reasoner'>('deepseek-chat')

const aiActiveConv = computed(() => aiConvs.value.find((c) => c.id === aiActiveId.value) || null)

async function loadAiList() {
  aiLoadingList.value = true
  try {
    const res: any = await request.get('/continue-chat', { params: { pageSize: 100 } })
    aiConvs.value = res.conversations || []
  } catch {
    /* ignore */
  } finally {
    aiLoadingList.value = false
  }
}

async function createAiConversation() {
  const title = aiInput.value.trim().slice(0, 30) || '新对话'
  try {
    const res: any = await request.post('/continue-chat', {
      title,
      messages: [{ role: 'user', content: aiInput.value.trim() }],
      model: aiModel.value,
    })
    aiActiveId.value = res.conversation.id
    aiConvs.value.unshift(res.conversation)
    aiInput.value = ''
    loadAiConversation(res.conversation.id)
  } catch {
    /* ignore */
  }
}

async function loadAiConversation(id: number) {
  aiActiveId.value = id
  aiLoadingConv.value = true
  try {
    const res: any = await request.get(`/continue-chat/${id}`)
    aiMessages.value = res.conversation?.messages || []
  } catch {
    /* ignore */
  } finally {
    aiLoadingConv.value = false
  }
}

async function sendAiMessage() {
  const content = aiInput.value.trim()
  if (!content || aiSending.value || !aiActiveId.value) return

  aiSending.value = true
  aiInput.value = ''
  const userMsg: UnifiedMessage = {
    id: Date.now(),
    conversationId: aiActiveId.value,
    role: 'USER',
    content,
    insertedAt: new Date().toISOString(),
  }
  aiMessages.value.push(userMsg)
  const aiMsg: UnifiedMessage = {
    id: Date.now() + 1,
    conversationId: aiActiveId.value,
    role: 'ASSISTANT',
    content: '',
    insertedAt: new Date().toISOString(),
  }
  aiMessages.value.push(aiMsg)

  await ssePost(`/continue-chat/${aiActiveId.value}/message`, { content, model: aiModel.value }, {
    onDelta: (delta) => { aiMsg.content += delta },
    onDone: () => { aiSending.value = false },
    onError: (e) => {
      aiMsg.content = `❌ ${e.message}`
      aiSending.value = false
      ElMessage.error(e.message)
    },
  })
}

// ═══════════════════════════════════════════════════
// Agent 续聊状态
// ═══════════════════════════════════════════════════
const agentConvs = ref<UnifiedConversation[]>([])
const agentActiveId = ref<number | null>(null)
const agentMessages = ref<UnifiedMessage[]>([])
const agentInput = ref('')
const agentSending = ref(false)
const agentLoadingList = ref(false)
const agentLoadingConv = ref(false)
const agentModel = ref<'step-1o' | 'step-1o-flash' | 'step-1v'>('step-1o')
const skillCount = ref(0)
const mcpCount = ref(0)
const agentBalance = ref(0)

const agentActiveConv = computed(() => agentConvs.value.find((c) => c.id === agentActiveId.value) || null)

async function loadAgentList() {
  agentLoadingList.value = true
  try {
    const [convRes, skillRes, mcpRes]: any[] = await Promise.all([
      request.get('/agent', { params: { pageSize: 100 } }),
      request.get('/skills'),
      request.get('/mcp'),
    ])
    agentConvs.value = convRes.conversations || []
    skillCount.value = (skillRes.skills || []).filter((s: any) => s.enabled).length
    mcpCount.value = (mcpRes.servers || []).filter((s: any) => s.enabled).length
  } catch {
    /* ignore */
  } finally {
    agentLoadingList.value = false
  }
}

async function createAgentConversation() {
  const title = agentInput.value.trim().slice(0, 30) || '新 Agent 对话'
  try {
    const res: any = await request.post('/agent', {
      title,
      messages: [{ role: 'user', content: agentInput.value.trim() }],
      model: agentModel.value,
    })
    agentActiveId.value = res.conversation.id
    agentConvs.value.unshift(res.conversation)
    agentInput.value = ''
    loadAgentConversation(res.conversation.id)
  } catch {
    /* ignore */
  }
}

async function loadAgentConversation(id: number) {
  agentActiveId.value = id
  agentLoadingConv.value = true
  try {
    const res: any = await request.get(`/agent/${id}`)
    agentMessages.value = res.conversation?.messages || []
  } catch {
    /* ignore */
  } finally {
    agentLoadingConv.value = false
  }
}

async function sendAgentMessage() {
  const content = agentInput.value.trim()
  if (!content || agentSending.value || !agentActiveId.value) return
  agentSending.value = true
  agentInput.value = ''
  const userMsg: UnifiedMessage = {
    id: Date.now(),
    conversationId: agentActiveId.value,
    role: 'USER',
    content,
    insertedAt: new Date().toISOString(),
  }
  agentMessages.value.push(userMsg)
  const aiMsg: UnifiedMessage = {
    id: Date.now() + 1,
    conversationId: agentActiveId.value,
    role: 'ASSISTANT',
    content: '',
    insertedAt: new Date().toISOString(),
  }
  agentMessages.value.push(aiMsg)

  await ssePost(`/agent/${agentActiveId.value}/message`, { content, model: agentModel.value }, {
    onDelta: (delta) => { aiMsg.content += delta },
    onDone: (data) => {
      agentSending.value = false
      if (typeof data.balance === 'number') agentBalance.value = data.balance
      if (data.toolCalls) {
        ElMessage.info(`Agent 调用了 ${data.toolCalls} 次工具`)
      }
    },
    onError: (e) => {
      aiMsg.content = `❌ ${e.message}`
      agentSending.value = false
      ElMessage.error(e.message)
    },
  })
}

function onAiEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    // 若无活跃对话，第一次回车创建对话并发送
    if (!aiActiveId.value && aiInput.value.trim()) {
      createAiConversation()
      return
    }
    sendAiMessage()
  }
}
function onAgentEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!agentActiveId.value && agentInput.value.trim()) {
      createAgentConversation()
      return
    }
    sendAgentMessage()
  }
}

// ═══════════════════════════════════════════════════
// 记忆试卷状态
// ═══════════════════════════════════════════════════
const papers = ref<TestPaper[]>([])
const papersTotal = ref(0)
const papersPage = ref(1)
const papersPageSize = 20
const papersLoading = ref(false)

const paperGenDialog = ref(false)
const paperRequirement = ref('')
const paperQuestionCount = ref(10)
const paperDifficulty = ref<'easy' | 'medium' | 'hard'>('medium')
const paperSelectedTypes = ref<QuestionType[]>([
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER',
])
const paperGenerating = ref(false)

const paperDetailDialog = ref(false)
const activePaper = ref<TestPaper | null>(null)
const showAnswers = ref(false)
const userAnswers = ref<Record<string, any>>({})

const TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTIPLE_CHOICE', label: '多选题' },
  { value: 'TRUE_FALSE', label: '判断题' },
  { value: 'FILL_BLANK', label: '填空题' },
  { value: 'SHORT_ANSWER', label: '简答题' },
]
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单', medium: '中等', hard: '困难',
}
const PAPER_STATUS_LABELS: Record<string, { text: string; type: string }> = {
  GENERATING: { text: '生成中', type: 'warning' },
  READY: { text: '已就绪', type: 'success' },
  FAILED: { text: '失败', type: 'danger' },
}

async function loadPapers() {
  papersLoading.value = true
  try {
    const res: any = await request.get('/test-papers', {
      params: { page: papersPage.value, pageSize: papersPageSize },
    })
    papers.value = res.papers || []
    papersTotal.value = res.total || 0
  } catch {
    /* ignore */
  } finally {
    papersLoading.value = false
  }
}

async function generatePaper() {
  if (!paperRequirement.value.trim()) {
    ElMessage.warning('请描述你想测试的知识点或需求')
    return
  }
  if (paperSelectedTypes.value.length === 0) {
    ElMessage.warning('请至少选择一种题型')
    return
  }
  paperGenerating.value = true
  try {
    const res: any = await request.post('/test-papers/generate', {
      requirement: paperRequirement.value,
      questionCount: paperQuestionCount.value,
      difficulty: paperDifficulty.value,
      types: paperSelectedTypes.value,
    })
    ElMessage.success('试卷生成中，请稍候...')
    paperGenDialog.value = false
    paperRequirement.value = ''
    await pollPaperJob(res.jobId)
  } catch {
    /* ignore */
  } finally {
    paperGenerating.value = false
  }
}

async function pollPaperJob(jobId: string) {
  const maxAttempts = 60
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res: any = await request.get(`/test-papers/job/${jobId}`)
      if (res.status === 'done') {
        ElMessage.success('试卷生成完成！')
        loadPapers()
        return
      }
      if (res.status === 'failed') {
        ElMessage.error(`生成失败：${res.error || '未知错误'}`)
        loadPapers()
        return
      }
    } catch {
      return
    }
  }
  ElMessage.info('生成时间较长，请稍后在列表中查看结果')
  loadPapers()
}

async function openPaperDetail(id: number) {
  try {
    const res: any = await request.get(`/test-papers/${id}`)
    activePaper.value = res.paper
    userAnswers.value = {}
    showAnswers.value = false
    paperDetailDialog.value = true
  } catch {
    /* ignore */
  }
}

async function deletePaper(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该试卷？', '提示', { type: 'warning' })
    await request.delete(`/test-papers/${id}`)
    ElMessage.success('已删除')
    loadPapers()
  } catch {
    /* ignore */
  }
}

const paperScore = computed(() => {
  if (!activePaper.value || !showAnswers.value) return 0
  let s = 0
  for (const q of activePaper.value.questions || []) {
    const ua = userAnswers.value[q.id]
    if (isAnswerCorrect(q, ua)) s += q.score
  }
  return s
})

function isAnswerCorrect(q: TestPaperQuestion, ua: any): boolean {
  if (ua === undefined || ua === null || ua === '') return false
  const ans = q.answer
  switch (q.type) {
    case 'SINGLE_CHOICE':
      return String(ua).toUpperCase() === String(ans).toUpperCase()
    case 'MULTIPLE_CHOICE': {
      const a = Array.isArray(ans) ? ans.map((x: string) => x.toUpperCase()).sort() : []
      const u = Array.isArray(ua) ? ua.map((x: string) => x.toUpperCase()).sort() : []
      return JSON.stringify(a) === JSON.stringify(u)
    }
    case 'TRUE_FALSE':
      return Boolean(ua) === Boolean(ans)
    case 'FILL_BLANK': {
      const a = Array.isArray(ans) ? ans : [ans]
      const u = Array.isArray(ua) ? ua : [ua]
      return a.every((x: string, i: number) => String(x).trim() === String(u[i] || '').trim())
    }
    case 'SHORT_ANSWER':
      return false
  }
}

// ═══════════════════════════════════════════════════
// Agent 工具状态
// ═══════════════════════════════════════════════════
const toolsTab = ref<'skills' | 'mcp'>('skills')

const skills = ref<Skill[]>([])
const skillDialog = ref(false)
const editingSkill = ref<Skill | null>(null)
const skillForm = ref({ name: '', description: '', content: '', tags: [] as string[], enabled: true })

const mcps = ref<McpServer[]>([])
const mcpDialog = ref(false)
const editingMcp = ref<McpServer | null>(null)
const mcpForm = ref({
  name: '',
  description: '',
  transport: 'HTTP' as 'HTTP' | 'STDIO',
  url: '',
  command: '',
  args: [] as string[],
  headers: {} as Record<string, string>,
  enabled: true,
})
const mcpHeadersText = ref('')

async function loadSkills() {
  try {
    const res: any = await request.get('/skills')
    skills.value = res.skills || []
  } catch {
    /* ignore */
  }
}

function openSkillDialog(skill?: Skill) {
  if (skill) {
    editingSkill.value = skill
    skillForm.value = {
      name: skill.name,
      description: skill.description || '',
      content: skill.content,
      tags: (skill.tags as string[]) || [],
      enabled: skill.enabled,
    }
  } else {
    editingSkill.value = null
    skillForm.value = { name: '', description: '', content: '', tags: [], enabled: true }
  }
  skillDialog.value = true
}

async function saveSkill() {
  if (!skillForm.value.name.trim() || !skillForm.value.content.trim()) {
    ElMessage.warning('请填写名称和内容')
    return
  }
  try {
    if (editingSkill.value) {
      await request.put(`/skills/${editingSkill.value.id}`, skillForm.value)
      ElMessage.success('已更新')
    } else {
      await request.post('/skills', skillForm.value)
      ElMessage.success('已创建')
    }
    skillDialog.value = false
    loadSkills()
  } catch {
    /* ignore */
  }
}

async function deleteSkill(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该技能？', '提示', { type: 'warning' })
    await request.delete(`/skills/${id}`)
    ElMessage.success('已删除')
    loadSkills()
  } catch {
    /* ignore */
  }
}

async function toggleSkill(skill: Skill) {
  await request.put(`/skills/${skill.id}`, { enabled: !skill.enabled })
  skill.enabled = !skill.enabled
}

async function loadMcps() {
  try {
    const res: any = await request.get('/mcp')
    mcps.value = res.servers || []
  } catch {
    /* ignore */
  }
}

function openMcpDialog(mcp?: McpServer) {
  if (mcp) {
    editingMcp.value = mcp
    mcpForm.value = {
      name: mcp.name,
      description: mcp.description || '',
      transport: mcp.transport,
      url: mcp.url || '',
      command: mcp.command || '',
      args: (mcp.args as string[]) || [],
      headers: (mcp.headers as Record<string, string>) || {},
      enabled: mcp.enabled,
    }
  } else {
    editingMcp.value = null
    mcpForm.value = {
      name: '', description: '', transport: 'HTTP',
      url: '', command: '', args: [], headers: {}, enabled: true,
    }
  }
  mcpHeadersText.value = JSON.stringify(mcpForm.value.headers, null, 2)
  mcpDialog.value = true
}

async function saveMcp() {
  if (!mcpForm.value.name.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  if (mcpForm.value.transport === 'HTTP' && !mcpForm.value.url.trim()) {
    ElMessage.warning('HTTP 模式必须填写 URL')
    return
  }
  if (mcpHeadersText.value.trim()) {
    try {
      mcpForm.value.headers = JSON.parse(mcpHeadersText.value)
    } catch {
      ElMessage.warning('Headers JSON 格式错误')
      return
    }
  } else {
    mcpForm.value.headers = {}
  }
  try {
    if (editingMcp.value) {
      await request.put(`/mcp/${editingMcp.value.id}`, mcpForm.value)
      ElMessage.success('已更新')
    } else {
      await request.post('/mcp', mcpForm.value)
      ElMessage.success('已创建')
    }
    mcpDialog.value = false
    loadMcps()
  } catch {
    /* ignore */
  }
}

async function deleteMcp(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该 MCP 服务器？', '提示', { type: 'warning' })
    await request.delete(`/mcp/${id}`)
    ElMessage.success('已删除')
    loadMcps()
  } catch {
    /* ignore */
  }
}

// ═══════════════════════════════════════════════════
// Tab 切换时按需加载数据
// ═══════════════════════════════════════════════════
const tabInited = ref<Record<HomeTab, boolean>>({
  'continue-chat': false,
  'agent': false,
  'test-paper': false,
  'agent-tools': false,
})

watch(activeTab, (tab) => {
  if (tab === 'continue-chat' && !tabInited.value['continue-chat']) {
    loadAiList()
    tabInited.value['continue-chat'] = true
  } else if (tab === 'agent' && !tabInited.value['agent']) {
    loadAgentList()
    tabInited.value['agent'] = true
  } else if (tab === 'test-paper' && !tabInited.value['test-paper']) {
    loadPapers()
    tabInited.value['test-paper'] = true
  } else if (tab === 'agent-tools' && !tabInited.value['agent-tools']) {
    loadSkills()
    loadMcps()
    tabInited.value['agent-tools'] = true
  }
}, { immediate: false })

onMounted(() => {
  loadAiList()
  tabInited.value['continue-chat'] = true
})
</script>

<template>
  <div class="home-page">
    <!-- ══════════ 顶部 Tab 切换栏 ══════════ -->
    <div class="home-tabs">
      <div
        v-for="tab in [
          { key: 'continue-chat', label: 'AI 续聊', icon: ChatDotRound, desc: 'DeepSeek 模型' },
          { key: 'agent', label: 'Agent 续聊', icon: Cpu, desc: 'StepFun + MCP' },
          { key: 'test-paper', label: '记忆试卷', icon: EditPen, desc: '基于知识库' },
          { key: 'agent-tools', label: 'Agent 工具', icon: Setting, desc: 'Skills / MCP' },
        ]"
        :key="tab.key"
        class="home-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key as HomeTab"
      >
        <el-icon :size="18"><component :is="tab.icon" /></el-icon>
        <div class="tab-text">
          <span class="tab-label">{{ tab.label }}</span>
          <span class="tab-desc">{{ tab.desc }}</span>
        </div>
      </div>
    </div>

    <!-- ══════════ 内容区 ══════════ -->
    <!-- AI 续聊 -->
    <div v-show="activeTab === 'continue-chat'" class="chat-shell">
      <div class="sidebar">
        <el-button type="primary" class="new-btn" :icon="Plus" @click="createAiConversation">
          新建对话
        </el-button>
        <div class="conv-list" v-loading="aiLoadingList">
          <div
            v-for="conv in aiConvs"
            :key="conv.id"
            class="conv-item"
            :class="{ active: conv.id === aiActiveId }"
            @click="loadAiConversation(conv.id)"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span class="conv-title">{{ conv.title }}</span>
            <span class="conv-turns">{{ conv.turnCount }} 轮</span>
          </div>
          <el-empty v-if="aiConvs.length === 0" description="暂无对话" :image-size="80" />
        </div>
      </div>

      <div class="chat-area">
        <div class="chat-header">
          <span class="chat-title">{{ aiActiveConv?.title || '选择或新建对话' }}</span>
          <el-select v-model="aiModel" size="small" style="width: 160px">
            <el-option label="DeepSeek Chat" value="deepseek-chat" />
            <el-option label="DeepSeek Reasoner" value="deepseek-reasoner" />
          </el-select>
        </div>

        <div class="messages" v-loading="aiLoadingConv">
          <div
            v-for="msg in aiMessages"
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
          <el-empty v-if="aiMessages.length === 0 && !aiLoadingConv" description="开始你的 AI 对话" :image-size="100" />
        </div>

        <div class="input-area">
          <el-input
            v-model="aiInput"
            type="textarea"
            :rows="2"
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            :disabled="aiSending"
            @keydown="onAiEnter"
          />
          <el-button
            type="primary"
            :icon="aiSending ? Loading : Promotion"
            :disabled="!aiInput.trim() || aiSending"
            @click="aiActiveId ? sendAiMessage() : createAiConversation()"
          >
            发送
          </el-button>
        </div>
      </div>
    </div>

    <!-- Agent 续聊 -->
    <div v-show="activeTab === 'agent'" class="chat-shell">
      <div class="sidebar">
        <el-button type="primary" class="new-btn" :icon="Plus" @click="createAgentConversation">
          新建 Agent 对话
        </el-button>
        <div class="capability-row">
          <el-tag :icon="Cpu" type="success" size="small">{{ skillCount }} 技能</el-tag>
          <el-tag :icon="Connection" type="warning" size="small">{{ mcpCount }} MCP</el-tag>
        </div>
        <div class="conv-list" v-loading="agentLoadingList">
          <div
            v-for="conv in agentConvs"
            :key="conv.id"
            class="conv-item"
            :class="{ active: conv.id === agentActiveId }"
            @click="loadAgentConversation(conv.id)"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span class="conv-title">{{ conv.title }}</span>
            <span class="conv-turns">{{ conv.turnCount }} 轮</span>
          </div>
          <el-empty v-if="agentConvs.length === 0" description="暂无对话" :image-size="80" />
        </div>
      </div>

      <div class="chat-area">
        <div class="chat-header">
          <span class="chat-title">{{ agentActiveConv?.title || '选择或新建 Agent 对话' }}</span>
          <el-select v-model="agentModel" size="small" class="model-select">
            <el-option label="Step-1o" value="step-1o" />
            <el-option label="Step-1o Flash" value="step-1o-flash" />
            <el-option label="Step-1v" value="step-1v" />
          </el-select>
        </div>

        <div class="messages" v-loading="agentLoadingConv">
          <div
            v-for="msg in agentMessages"
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
          <el-empty v-if="agentMessages.length === 0 && !agentLoadingConv" description="Agent 可使用你的 Skills 和 MCP 工具" :image-size="100" />
        </div>

        <div class="input-area">
          <el-input
            v-model="agentInput"
            type="textarea"
            :rows="2"
            placeholder="Agent 可使用你的 Skills 和 MCP 工具，Enter 发送"
            :disabled="agentSending"
            @keydown="onAgentEnter"
          />
          <el-button
            type="primary"
            :icon="agentSending ? Loading : Promotion"
            :disabled="!agentInput.trim() || agentSending"
            @click="agentActiveId ? sendAgentMessage() : createAgentConversation()"
          >
            发送
          </el-button>
        </div>
      </div>
    </div>

    <!-- 记忆试卷 -->
    <div v-show="activeTab === 'test-paper'" class="panel-shell">
      <div class="panel-toolbar">
        <el-button type="primary" :icon="MagicStick" size="large" @click="paperGenDialog = true">
          生成记忆试卷
        </el-button>
        <el-button :icon="Refresh" @click="loadPapers">刷新</el-button>
        <span class="panel-tip">基于你的对话知识库，AI 自动生成试卷与参考答案</span>
      </div>

      <el-card shadow="never">
        <el-table :data="papers" v-loading="papersLoading" stripe>
          <el-table-column prop="title" label="试卷标题" min-width="200" show-overflow-tooltip />
          <el-table-column label="难度" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ DIFFICULTY_LABELS[row.difficulty] || row.difficulty }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="questionCount" label="题数" width="70" align="center" />
          <el-table-column prop="totalScore" label="总分" width="70" align="center" />
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="PAPER_STATUS_LABELS[row.status]?.type as any" size="small">
                {{ PAPER_STATUS_LABELS[row.status]?.text || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">
              {{ new Date(row.createdAt).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'READY'"
                text
                type="primary"
                :icon="View"
                @click="openPaperDetail(row.id)"
              >
                查看
              </el-button>
              <el-button text type="danger" :icon="Delete" @click="deletePaper(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="papersTotal > papersPageSize" class="pagination">
          <el-pagination
            v-model:current-page="papersPage"
            :page-size="papersPageSize"
            :total="papersTotal"
            layout="prev, pager, next"
            @current-change="loadPapers"
          />
        </div>
      </el-card>

      <!-- 生成弹窗 -->
      <el-dialog v-model="paperGenDialog" title="生成记忆试卷" width="560px">
        <el-form label-position="top">
          <el-form-item label="描述你想测试的知识点或需求">
            <el-input
              v-model="paperRequirement"
              type="textarea"
              :rows="4"
              placeholder="例如：我想测试自己对 React Hooks 的理解，包括 useState、useEffect、useMemo 的区别和使用场景"
            />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="题量">
                <el-input-number v-model="paperQuestionCount" :min="1" :max="50" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="难度">
                <el-select v-model="paperDifficulty" style="width: 100%">
                  <el-option label="简单" value="easy" />
                  <el-option label="中等" value="medium" />
                  <el-option label="困难" value="hard" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="题型（可多选）">
            <el-checkbox-group v-model="paperSelectedTypes">
              <el-checkbox v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">
                {{ t.label }}
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="paperGenDialog = false">取消</el-button>
          <el-button type="primary" :loading="paperGenerating" @click="generatePaper">
            生成试卷
          </el-button>
        </template>
      </el-dialog>

      <!-- 详情弹窗 -->
      <el-dialog v-model="paperDetailDialog" :title="activePaper?.title || '试卷详情'" width="720px" top="5vh">
        <div v-if="activePaper" class="paper-detail">
          <div class="paper-meta">
            <el-tag>{{ DIFFICULTY_LABELS[activePaper.difficulty] }}</el-tag>
            <span>{{ activePaper.questionCount }} 题 / {{ activePaper.totalScore }} 分</span>
            <span v-if="activePaper.subject">科目：{{ activePaper.subject }}</span>
          </div>
          <p v-if="activePaper.description" class="paper-desc">{{ activePaper.description }}</p>

          <div class="questions">
            <div v-for="q in activePaper.questions" :key="q.id" class="question">
              <div class="q-header">
                <span class="q-index">{{ q.orderIndex + 1 }}.</span>
                <el-tag size="small" type="info">{{ TYPE_OPTIONS.find(t => t.value === q.type)?.label }}</el-tag>
                <span class="q-score">{{ q.score }} 分</span>
              </div>
              <div class="q-content">{{ q.content }}</div>

              <div v-if="q.options?.length" class="q-options">
                <el-radio-group v-if="q.type === 'SINGLE_CHOICE'" v-model="userAnswers[q.id]">
                  <el-radio v-for="opt in q.options" :key="opt.key" :value="opt.key">
                    {{ opt.key }}. {{ opt.text }}
                  </el-radio>
                </el-radio-group>
                <el-checkbox-group v-else-if="q.type === 'MULTIPLE_CHOICE'" v-model="userAnswers[q.id]">
                  <el-checkbox v-for="opt in q.options" :key="opt.key" :value="opt.key">
                    {{ opt.key }}. {{ opt.text }}
                  </el-checkbox>
                </el-checkbox-group>
              </div>

              <el-radio-group v-if="q.type === 'TRUE_FALSE'" v-model="userAnswers[q.id]">
                <el-radio :value="true">正确</el-radio>
                <el-radio :value="false">错误</el-radio>
              </el-radio-group>

              <div v-if="q.type === 'FILL_BLANK'" class="q-fill">
                <el-input
                  v-for="(_, idx) in (Array.isArray(q.answer) ? q.answer.length : 1)"
                  :key="idx"
                  v-model="userAnswers[q.id + '_' + idx]"
                  :placeholder="'空 ' + (idx + 1)"
                  style="margin-bottom: 8px"
                />
              </div>

              <el-input
                v-if="q.type === 'SHORT_ANSWER'"
                v-model="userAnswers[q.id]"
                type="textarea"
                :rows="3"
                placeholder="请输入你的答案"
              />

              <div v-if="showAnswers" class="q-answer">
                <div class="answer-row">
                  <span class="answer-label">参考答案：</span>
                  <span class="answer-value">
                    {{ Array.isArray(q.answer) ? q.answer.join(', ') : q.answer }}
                  </span>
                  <el-icon v-if="q.type !== 'SHORT_ANSWER'" :color="isAnswerCorrect(q, userAnswers[q.id]) ? '#67c23a' : '#f56c6c'">
                    <Check v-if="isAnswerCorrect(q, userAnswers[q.id])" />
                    <Close v-else />
                  </el-icon>
                </div>
                <div v-if="q.explanation" class="q-explanation">
                  <strong>解析：</strong>{{ q.explanation }}
                </div>
              </div>
            </div>
          </div>

          <div class="detail-footer">
            <el-button v-if="!showAnswers" type="primary" @click="showAnswers = true">
              提交并查看答案
            </el-button>
            <template v-else>
              <el-result
                v-if="paperScore > 0"
                :title="`得分：${paperScore} / ${activePaper.totalScore}`"
                sub-title="简答题需自行对照参考答案评分"
                :icon="Document"
              />
              <el-button @click="showAnswers = false">重新答题</el-button>
            </template>
          </div>
        </div>
      </el-dialog>
    </div>

    <!-- Agent 工具 -->
    <div v-show="activeTab === 'agent-tools'" class="panel-shell">
      <el-tabs v-model="toolsTab">
        <el-tab-pane label="Skills 技能库" name="skills">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="openSkillDialog()">新建 Skill</el-button>
            <el-button :icon="Refresh" @click="loadSkills">刷新</el-button>
          </div>
          <el-table :data="skills" stripe>
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
            <el-table-column label="启用" width="80" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.enabled" size="small" @change="toggleSkill(row)" />
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">
                {{ new Date(row.updatedAt).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" :icon="Edit" @click="openSkillDialog(row)">编辑</el-button>
                <el-button text type="danger" :icon="Delete" @click="deleteSkill(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="skills.length === 0" description="暂无 Skill，点击上方按钮创建" />
        </el-tab-pane>

        <el-tab-pane label="MCP 服务器" name="mcp">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="openMcpDialog()">新建 MCP</el-button>
            <el-button :icon="Refresh" @click="loadMcps">刷新</el-button>
          </div>
          <el-table :data="mcps" stripe>
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
            <el-table-column label="传输" width="80" align="center">
              <template #default="{ row }">
                <el-tag size="small">{{ row.transport }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="地址/命令" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.transport === 'HTTP' ? row.url : row.command }}
              </template>
            </el-table-column>
            <el-table-column label="启用" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                  {{ row.enabled ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" :icon="Edit" @click="openMcpDialog(row)">编辑</el-button>
                <el-button text type="danger" :icon="Delete" @click="deleteMcp(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="mcps.length === 0" description="暂无 MCP 服务器，点击上方按钮创建" />
        </el-tab-pane>
      </el-tabs>

      <!-- Skill 编辑弹窗 -->
      <el-dialog v-model="skillDialog" :title="editingSkill ? '编辑 Skill' : '新建 Skill'" width="640px">
        <el-form label-position="top">
          <el-form-item label="名称">
            <el-input v-model="skillForm.name" placeholder="例如：代码审查助手" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="skillForm.description" placeholder="简要描述这个技能的用途" />
          </el-form-item>
          <el-form-item label="Skill.md 内容">
            <el-input
              v-model="skillForm.content"
              type="textarea"
              :rows="12"
              placeholder="# 技能说明&#10;描述这个技能的能力、使用场景、注意事项等"
            />
          </el-form-item>
          <el-form-item label="标签（逗号分隔）">
            <el-input
              :model-value="skillForm.tags.join(',')"
              placeholder="代码, 审查"
              @input="(v: string) => (skillForm.tags = v.split(',').map(s => s.trim()).filter(Boolean))"
            />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="skillForm.enabled">启用</el-checkbox>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="skillDialog = false">取消</el-button>
          <el-button type="primary" @click="saveSkill">保存</el-button>
        </template>
      </el-dialog>

      <!-- MCP 编辑弹窗 -->
      <el-dialog v-model="mcpDialog" :title="editingMcp ? '编辑 MCP' : '新建 MCP'" width="560px">
        <el-form label-position="top">
          <el-form-item label="名称">
            <el-input v-model="mcpForm.name" placeholder="例如：文件系统 MCP" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="mcpForm.description" placeholder="简要描述" />
          </el-form-item>
          <el-form-item label="传输方式">
            <el-radio-group v-model="mcpForm.transport">
              <el-radio value="HTTP">HTTP</el-radio>
              <el-radio value="STDIO">STDIO</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="mcpForm.transport === 'HTTP'" label="URL">
            <el-input v-model="mcpForm.url" placeholder="https://mcp.example.com/mcp" />
          </el-form-item>
          <el-form-item v-if="mcpForm.transport === 'STDIO'" label="启动命令">
            <el-input v-model="mcpForm.command" placeholder="npx -y @modelcontextprotocol/server-filesystem" />
          </el-form-item>
          <el-form-item v-if="mcpForm.transport === 'HTTP'" label="请求头（JSON）">
            <el-input
              v-model="mcpHeadersText"
              type="textarea"
              :rows="4"
              placeholder='{"Authorization": "Bearer xxx"}'
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="mcpDialog = false">取消</el-button>
          <el-button type="primary" @click="saveMcp">保存</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  height: calc(100dvh - 100px);
  gap: 16px;
}

/* ══════════ 顶部 Tab 切换栏 ══════════ */
.home-tabs {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}
.home-tab {
  flex: 1;
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.home-tab:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}
.home-tab.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.home-tab .tab-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.tab-label {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.tab-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.home-tab.active .tab-desc {
  color: var(--el-color-primary);
  opacity: 0.8;
}

/* ══════════ 聊天外壳（AI / Agent 共享） ══════════ */
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
.capability-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

/* ══════════ 面板外壳（试卷 / 工具） ══════════ */
.panel-shell {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.panel-tip {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.paper-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.paper-desc {
  color: var(--el-text-color-regular);
  margin: 8px 0 16px;
}
.questions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.question {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.q-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.q-index {
  font-weight: 600;
}
.q-score {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.q-content {
  margin-bottom: 12px;
  line-height: 1.6;
}
.q-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q-fill {
  display: flex;
  flex-direction: column;
}
.q-answer {
  margin-top: 12px;
  padding: 10px;
  background: var(--el-color-success-light-9);
  border-radius: 6px;
}
.answer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.answer-label {
  font-weight: 600;
  color: var(--el-color-success);
}
.answer-value {
  flex: 1;
}
.q-explanation {
  margin-top: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}
.detail-footer {
  margin-top: 20px;
  text-align: center;
}
.tab-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

/* ══════════ 窄屏适配 ══════════ */
@media (max-width: 768px) {
  .home-page {
    height: auto;
    min-height: calc(100vh - 100px);
  }
  .home-tab .tab-desc {
    display: none;
  }
  .home-tab {
    min-width: 100px;
    padding: 10px 10px;
    gap: 6px;
  }
  .chat-shell {
    flex-direction: column;
    height: 70vh;
  }
  .sidebar {
    width: 100%;
    max-height: 180px;
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
  .model-select {
    width: 130px;
  }
  .q-options :deep(.el-radio),
  .q-options :deep(.el-checkbox) {
    display: block;
    margin: 4px 0;
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
