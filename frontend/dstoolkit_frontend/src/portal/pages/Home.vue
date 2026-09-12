<script setup lang="ts">
/**
 * Home.vue（基于 element-ai-vue 重做门户首页）
 *  - Hero：标签 + 标题 + 副标题 + CTA
 *  - 实时 AI 对话演示（ElABubbleList + ElABubble + ElASender + ElAMarkdown）
 *  - 功能亮点卡片（含"多样化导出"取代旧版"导出 Alpaca"）
 *  - 注册引导横幅
 */
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Component } from 'vue'
import {
  Search, PieChart, MagicStick, Upload, ArrowRight, Promotion,
} from '@element-plus/icons-vue'

const router = useRouter()

// ═══════════ 实时对话演示 ═══════════
interface DemoMessage {
  key: string
  role: 'user' | 'assistant'
  content: string
}

const demoMessages = ref<DemoMessage[]>([
  {
    key: 'm1',
    role: 'assistant',
    content: `你好！我是 **Deepseek Toolkit** 的 AI 助手演示。\n\n我可以帮你：\n- 📥 **导入对话** — 上传压缩包，自动解压、统计、拆分并推送至 Git 仓库\n- 🔍 **全文检索** — 数秒定位历史对话\n- 📊 **可视化导出** — JSON / CSV / Markdown / HTML / Alpaca 多格式\n\n试试在下方输入框向我提问吧！`,
  },
])

const demoInput = ref('')
const demoThinking = ref(false)
const chatBodyRef = ref<HTMLElement | null>(null)

const cannedReplies: string[] = [
  `这是个好问题！Deepseek Toolkit 的核心价值在于把你的 **AI 对话变成可管理的资产**。\n\n### 三大能力\n1. **对话容器** — Git 仓库化存储，支持断电续传\n2. **任务队列** — 上传/推送全程可视化（等待中 → 执行中 → 完成）\n3. **多样化导出** — 一键生成微调训练数据集`,
  `我们的任务队列系统支持 **断电续传**：\n\n- 任务持久化到数据库，进程重启自动恢复\n- 右上角小红点实时提示任务进度\n- 上传流程：\`压缩包 → 解压 → 统计 → 拆分 → 推送 Git\`\n\n即使中途断电，已完成的步骤不会重做。`,
  `导出功能现已升级为 **多样化可视化导出**：\n\n| 格式 | 用途 |\n|------|------|\n| JSON | 完整保留结构 |\n| CSV | Excel 分析 |\n| Markdown | 归档阅读 |\n| HTML | 浏览器直开 |\n| Alpaca | 模型微调 |\n\n不再局限于单一 Alpaca 格式！`,
]

let replyIdx = 0

async function scrollToBottom() {
  await nextTick()
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  }
}

function onDemoSubmit(value: string) {
  const text = (value || '').trim()
  if (!text || demoThinking.value) return
  demoMessages.value.push({ key: `u${Date.now()}`, role: 'user', content: text })
  demoInput.value = ''
  demoThinking.value = true
  scrollToBottom()

  setTimeout(() => {
    const reply = cannedReplies[replyIdx % cannedReplies.length] ?? ''
    replyIdx++
    demoMessages.value.push({ key: `a${Date.now()}`, role: 'assistant', content: reply })
    demoThinking.value = false
    scrollToBottom()
  }, 1200)
}

// ═══════════ 功能亮点 ═══════════
interface HighlightCard {
  icon: Component
  title: string
  desc: string
  accent: 'primary' | 'success' | 'warning' | 'info'
}

const highlights: HighlightCard[] = [
  {
    icon: Search,
    title: '全文检索',
    desc: '支持正则、关键词、多条件筛选，数秒内定位历史对话，灵活的过滤器让查找更精准。',
    accent: 'primary',
  },
  {
    icon: PieChart,
    title: '数据可视化',
    desc: '基于 ECharts 的对话量、模型分布、活跃时段统计，一图掌握使用趋势与洞察。',
    accent: 'success',
  },
  {
    icon: MagicStick,
    title: '模型切换 / 聊天',
    desc: '无缝切换多种模型，在统一的聊天界面中续写对话，保持语境连贯，高效协作。',
    accent: 'warning',
  },
  {
    icon: Upload,
    title: '多样化导出',
    desc: '一键导出 JSON / CSV / Markdown / HTML / Alpaca 多种格式，对话即资产，直接用于分析与微调。',
    accent: 'info',
  },
]

// ═══════════ 任务队列流程展示 ═══════════
interface FlowStep {
  label: string
  desc: string
}
const uploadFlow: FlowStep[] = [
  { label: '上传压缩包', desc: 'ZIP 包一键上传' },
  { label: '解压压缩包', desc: '自动识别 conversations.json' },
  { label: '统计对话', desc: '对话数 / 轮次数统计' },
  { label: '拆分对话', desc: '按轮次拆分存储（非整段 JSON）' },
  { label: '推送 Git', desc: '拆分文件树推送至仓库' },
]
</script>

<template>
  <div class="portal-home">
    <!-- ══════════ Hero ══════════ -->
    <section class="hero-section">
      <div class="hero-inner">
        <span class="hero-tag">
          <el-icon :size="14"><Promotion /></el-icon>
          <span>对话即资产 · 一站式管理 · 基于 Element AI Vue</span>
        </span>

        <h1 class="hero-title">
          AI 对话资产，<span class="title-accent">一站式管理</span>
        </h1>

        <p class="hero-subtitle">
          轻松导入 Deepseek 导出数据，全文检索历史对话，可视化分析使用趋势，
          多样化格式导出，把 AI 对话变成真正属于你的资产。
        </p>

        <div class="hero-cta">
          <el-button type="primary" size="large" round @click="router.push('/register')">
            立即开始
            <el-icon class="btn-arrow"><ArrowRight /></el-icon>
          </el-button>
          <el-button size="large" round @click="router.push('/portal/features')">
            查看功能
          </el-button>
        </div>
      </div>
    </section>

    <!-- ══════════ 实时 AI 对话演示（element-ai-vue） ══════════ -->
    <section class="demo-section">
      <div class="demo-inner">
        <div class="demo-header">
          <h2>实时 AI 对话演示</h2>
          <p>基于 <a href="https://element-ai-vue.com" target="_blank" rel="noopener">Element AI Vue</a> 组件库构建 · Bubble / Sender / Markdown 一站式 AI 聊天体验</p>
        </div>

        <div class="demo-chat">
          <!-- 对话区 -->
          <div ref="chatBodyRef" class="chat-body">
            <ElABubbleList :bottom-threshold="0">
              <div class="bubble-stack">
                <template v-for="msg in demoMessages" :key="msg.key">
                  <ElABubble
                    :placement="msg.role === 'user' ? 'end' : 'start'"
                    :content="msg.content"
                    :is-markdown="true"
                    variant="filled"
                    shape="round"
                  />
                </template>
                <ElABubble
                  v-if="demoThinking"
                  placement="start"
                  :loading="true"
                  content=""
                />
              </div>
            </ElABubbleList>
          </div>
          <!-- 输入区 -->
          <div class="chat-sender">
            <ElASender
              v-model="demoInput"
              :loading="demoThinking"
              placeholder="试试输入你的问题…（演示用，非真实 AI）"
              @submit="onDemoSubmit"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════ 功能亮点 ══════════ -->
    <section class="highlights-section">
      <div class="highlights-inner">
        <div class="section-title">
          <h2>核心功能</h2>
          <p>从导入到导出，全链路管理你的 AI 对话资产</p>
        </div>
        <div class="highlights-grid">
          <el-card
            v-for="item in highlights"
            :key="item.title"
            shadow="hover"
            class="highlight-card"
          >
            <div class="card-icon-wrap" :class="`accent-${item.accent}`">
              <el-icon :size="24"><component :is="item.icon" /></el-icon>
            </div>
            <h3 class="card-title">{{ item.title }}</h3>
            <p class="card-desc">{{ item.desc }}</p>
          </el-card>
        </div>
      </div>
    </section>

    <!-- ══════════ 上传流程 ══════════ -->
    <section class="flow-section">
      <div class="flow-inner">
        <div class="section-title">
          <h2>上传与任务队列</h2>
          <p>断电续传 · 全程可视化 · 拆分存储（不再直接存原始 JSON）</p>
        </div>
        <div class="flow-steps">
          <div v-for="(step, i) in uploadFlow" :key="step.label" class="flow-step">
            <div class="step-index">{{ i + 1 }}</div>
            <div class="step-body">
              <div class="step-label">{{ step.label }}</div>
              <div class="step-desc">{{ step.desc }}</div>
            </div>
            <el-icon v-if="i < uploadFlow.length - 1" class="step-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
        <div class="flow-status-hint">
          <el-tag type="info" effect="plain">等待中</el-tag>
          <el-icon class="hint-arrow"><ArrowRight /></el-icon>
          <el-tag type="warning" effect="plain">执行中</el-tag>
          <el-icon class="hint-arrow"><ArrowRight /></el-icon>
          <el-tag type="success" effect="plain">完成</el-tag>
          <span class="hint-text">任务队列全程追踪 · 右上角小红点实时提醒</span>
        </div>
      </div>
    </section>

    <!-- ══════════ 注册引导横幅 ══════════ -->
    <section class="cta-banner-section">
      <div class="cta-banner-inner">
        <div class="cta-banner">
          <div class="banner-text">
            <h3 class="banner-title">准备好把 AI 对话变成你的资产了吗？</h3>
            <p class="banner-sub">
              免费注册，立即使用所有功能；首个注册用户自动成为管理员。
            </p>
          </div>
          <el-button class="banner-btn" size="large" round @click="router.push('/register')">
            立即免费注册
            <el-icon class="btn-arrow"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ══════════ Hero ══════════ */
.hero-section {
  padding: 76px 24px 40px;
  display: flex;
  justify-content: center;
}
.hero-inner {
  max-width: 860px;
  text-align: center;
}
.hero-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 24px;
}
.hero-title {
  font-size: 46px;
  line-height: 1.18;
  margin: 0 0 20px;
  letter-spacing: -0.02em;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.title-accent {
  color: var(--el-color-primary);
}
.hero-subtitle {
  font-size: 16px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  max-width: 640px;
  margin: 0 auto 32px;
}
.hero-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-arrow {
  margin-left: 4px;
}

/* ══════════ 演示区 ══════════ */
.demo-section {
  padding: 8px 24px 56px;
  display: flex;
  justify-content: center;
}
.demo-inner {
  max-width: 860px;
  width: 100%;
}
.demo-header {
  text-align: center;
  margin-bottom: 24px;
}
.demo-header h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--el-text-color-primary);
}
.demo-header p {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 0;
}
.demo-header a {
  color: var(--el-color-primary);
  text-decoration: none;
}
.demo-chat {
  border: 1px solid var(--el-border-color-light);
  border-radius: 16px;
  overflow: hidden;
  background: var(--el-bg-color);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}
.chat-body {
  height: 380px;
  overflow-y: auto;
  padding: 20px;
  background: var(--el-fill-color-lighter);
}
.bubble-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chat-sender {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 12px 16px;
  background: var(--el-bg-color);
}

/* ══════════ 通用 section 标题 ══════════ */
.section-title {
  text-align: center;
  margin-bottom: 32px;
}
.section-title h2 {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--el-text-color-primary);
  letter-spacing: -0.01em;
}
.section-title p {
  font-size: 15px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

/* ══════════ 功能亮点 ══════════ */
.highlights-section {
  padding: 16px 24px 48px;
  display: flex;
  justify-content: center;
}
.highlights-inner {
  max-width: 1200px;
  width: 100%;
}
.highlights-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.highlight-card :deep(.el-card__body) {
  padding: 24px 22px;
}
.card-icon-wrap {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.accent-primary {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.accent-success {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.accent-warning {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}
.accent-info {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
}
.card-title {
  font-size: 16.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 10px;
  line-height: 1.3;
}
.card-desc {
  font-size: 13.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.65;
  margin: 0;
}

/* ══════════ 上传流程 ══════════ */
.flow-section {
  padding: 16px 24px 56px;
  display: flex;
  justify-content: center;
}
.flow-inner {
  max-width: 1100px;
  width: 100%;
}
.flow-steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}
.flow-step {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 14px 18px;
  flex: 1;
  min-width: 160px;
}
.step-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.step-body {
  min-width: 0;
}
.step-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.step-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.step-arrow {
  color: var(--el-text-color-placeholder);
  font-size: 18px;
  flex-shrink: 0;
}
.flow-status-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.hint-arrow {
  color: var(--el-text-color-placeholder);
}
.hint-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}

/* ══════════ 注册引导横幅 ══════════ */
.cta-banner-section {
  padding: 24px 24px 80px;
  display: flex;
  justify-content: center;
}
.cta-banner-inner {
  max-width: 1200px;
  width: 100%;
}
.cta-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 34px 38px;
  border-radius: 12px;
  background: var(--el-color-primary);
}
.banner-text {
  flex: 1;
  min-width: 0;
}
.banner-title {
  font-size: 21px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px;
  line-height: 1.3;
}
.banner-sub {
  font-size: 14px;
  color: #fff;
  opacity: 0.88;
  margin: 0;
  line-height: 1.6;
}
.banner-btn {
  flex-shrink: 0;
  background: #fff;
  border-color: #fff;
  color: var(--el-color-primary);
  font-weight: 600;
}
.banner-btn:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-9);
}

@media (max-width: 960px) {
  .hero-section {
    padding: 52px 18px 32px;
  }
  .hero-title {
    font-size: 34px;
  }
  .hero-subtitle {
    font-size: 15px;
  }
  .highlights-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .chat-body {
    height: 320px;
  }
  .cta-banner {
    flex-direction: column;
    align-items: flex-start;
    padding: 26px 22px;
  }
  .flow-step {
    min-width: 100%;
  }
  .step-arrow {
    display: none;
  }
}
@media (max-width: 560px) {
  .hero-title {
    font-size: 28px;
  }
  .highlights-grid {
    grid-template-columns: 1fr;
  }
  .banner-btn {
    width: 100%;
  }
}
</style>
