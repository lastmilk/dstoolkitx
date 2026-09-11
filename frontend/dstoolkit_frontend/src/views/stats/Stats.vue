<script setup lang="ts">
/**
 * 知识库功能页（原数据统计，集成记忆试卷）
 *  - Tab 1：数据统计（云端 /stats 或本地 localStats，4 指标卡 + 4 ECharts 图表）
 *  - Tab 2：记忆试卷（生成 / 列表 / 详情 / 答题 / 自动判分）
 *  - 配色使用 Element Plus 语义色；暗色模式跟随 html.dark 切换文字/分割线颜色
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MagicStick, Refresh, View, Delete, Check, Close, Document,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { request } from '@/utils/request'
import { loadAllConversations } from '@/utils/db'
import type { ParsedConversation, TestPaper, TestPaperQuestion, QuestionType } from '@/types'

const auth = useAuthStore()
const themeStore = useThemeStore()
const loading = ref(false)

// ═══════════ Tab 切换 ═══════════
const activeTab = ref<'stats' | 'papers'>('stats')

// ===== 统计数据结构（云端 /stats 与本地 localStats 输出一致） =====
interface DailyMessagePoint {
  date: string
  user: number
  assistant: number
}
interface StatsData {
  totalConversations?: number
  totalMessages?: number
  dailyConversations?: Array<{ date: string; count: number }>
  dailyMessages?: DailyMessagePoint[]
  modelDistribution?: Array<{ model: string; count: number }>
  activeHours?: Array<{ hour: number; count: number }>
}

const stats = ref<StatsData>({})

// ===== 本地统计计算（与后端 /stats 口径一致：UTC+8 按日/按小时聚合） =====
function cnDate(d: string | Date): string {
  const t = new Date(d)
  return new Date(t.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}
function cnHour(d: string | Date): number {
  const t = new Date(d)
  return new Date(t.getTime() + 8 * 3600 * 1000).getUTCHours()
}

function localStats(convs: ParsedConversation[]): StatsData {
  const dailyConv = new Map<string, number>()
  const dailyMsg = new Map<string, DailyMessagePoint>()
  const modelDist = new Map<string, number>()
  const hours = new Array<number>(24).fill(0)
  let totalMsgs = 0
  for (const c of convs) {
    const dk = cnDate(c.insertedAt)
    dailyConv.set(dk, (dailyConv.get(dk) ?? 0) + 1)
    for (const m of c.messages) {
      totalMsgs++
      const d = cnDate(m.insertedAt)
      const cur = dailyMsg.get(d) ?? { date: d, user: 0, assistant: 0 }
      if (m.role === 'USER') cur.user++
      else cur.assistant++
      dailyMsg.set(d, cur)
      if (m.model) modelDist.set(m.model, (modelDist.get(m.model) ?? 0) + 1)
      const hi = cnHour(m.insertedAt)
      hours[hi] = (hours[hi] ?? 0) + 1
    }
  }
  return {
    totalConversations: convs.length,
    totalMessages: totalMsgs,
    dailyConversations: Array.from(dailyConv.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    dailyMessages: Array.from(dailyMsg.values()).sort((a, b) => a.date.localeCompare(b.date)),
    modelDistribution: Array.from(modelDist.entries()).map(([model, count]) => ({ model, count })),
    activeHours: hours.map((count, hour) => ({ hour, count })),
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    if (auth.cloudSyncEnabled) {
      // 云端：消息/会话统计统一由 GET /stats 端点返回
      stats.value = (await request.get('/stats')) as StatsData
    } else {
      const convs = await loadAllConversations(false)
      stats.value = localStats(convs)
    }
  } finally {
    loading.value = false
  }
}

// ═══════════ 配色：Element Plus 语义色 + 暗色自适应 ═══════════
const cPrimary = '#409EFF' // var(--el-color-primary)
const cSuccess = '#67C23A' // var(--el-color-success)
const cWarning = '#E6A23C' // var(--el-color-warning)
const cDanger = '#F56C6C' // var(--el-color-danger)
const cInfo = '#909399' // var(--el-color-info)

const paletteDonut = [cPrimary, cSuccess, cWarning, cDanger, cInfo, '#79BBFF', '#95D475', '#EEBE77']

/** 依据 EP 变量取值：亮色 text-regular/border 系，暗色对应 EP dark css-vars 值 */
const chartColors = computed(() => {
  if (themeStore.isDark) {
    return {
      axisText: '#A3A6AD', // --el-text-color-regular (dark)
      axisLine: '#4C4D4F', // --el-border-color (dark)
      splitLine: '#414243', // --el-border-color-light (dark)
      tooltipBg: '#1D1E1F', // --el-bg-color-overlay (dark)
      tooltipText: '#E5EAF3', // --el-text-color-primary (dark)
      legendText: '#CFD3DC', // --el-text-color-regular (dark)
    }
  }
  return {
    axisText: '#606266', // --el-text-color-regular
    axisLine: '#DCDFE6', // --el-border-color
    splitLine: '#E4E7ED', // --el-border-color-light
    tooltipBg: '#FFFFFF', // --el-bg-color-overlay
    tooltipText: '#303133', // --el-text-color-primary
    legendText: '#606266',
  }
})

const sharedTooltip = computed(() => ({
  trigger: 'axis' as const,
  backgroundColor: chartColors.value.tooltipBg,
  borderColor: chartColors.value.axisLine,
  borderWidth: 1,
  textStyle: { color: chartColors.value.tooltipText, fontSize: 12 },
}))

const totalModels = computed<number>(() =>
  (stats.value.modelDistribution ?? []).reduce((s, d) => s + (d.count ?? 0), 0),
)

// ————— 每日消息量趋势（用户提问 / AI 响应 双折线 + 面积）—————
const msgLineOption = computed(() => {
  const daily = stats.value.dailyMessages ?? []
  const colors = chartColors.value
  return {
    tooltip: sharedTooltip.value,
    legend: {
      data: ['用户提问', 'AI 响应'],
      top: 0,
      right: 4,
      textStyle: { color: colors.legendText, fontSize: 12 },
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
    },
    grid: { left: 42, right: 18, top: 44, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: daily.map((d) => d.date.slice(5)),
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisLabel: { color: colors.axisText, fontSize: 10, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: colors.splitLine, type: 'dashed' } },
      axisLabel: { color: colors.axisText, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '用户提问',
        type: 'line' as const,
        smooth: true,
        smoothMonotone: 'x' as const,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        data: daily.map((d) => d.user),
        itemStyle: { color: cPrimary },
        lineStyle: { width: 2.5, color: cPrimary },
        areaStyle: { color: 'rgba(64, 158, 255, 0.12)' },
      },
      {
        name: 'AI 响应',
        type: 'line' as const,
        smooth: true,
        smoothMonotone: 'x' as const,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        data: daily.map((d) => d.assistant),
        itemStyle: { color: cSuccess },
        lineStyle: { width: 2.5, color: cSuccess },
        areaStyle: { color: 'rgba(103, 194, 58, 0.12)' },
      },
    ],
  }
})

// ————— 每日对话数（平滑折线 + 面积）—————
const convLineOption = computed(() => {
  const daily = stats.value.dailyConversations ?? []
  const colors = chartColors.value
  return {
    tooltip: sharedTooltip.value,
    grid: { left: 42, right: 18, top: 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: daily.map((d) => d.date.slice(5)),
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisLabel: { color: colors.axisText, fontSize: 10, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: colors.splitLine, type: 'dashed' } },
      axisLabel: { color: colors.axisText, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '对话数',
        type: 'line' as const,
        smooth: true,
        smoothMonotone: 'x' as const,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        data: daily.map((d) => d.count),
        itemStyle: { color: cWarning },
        lineStyle: { width: 2.5, color: cWarning },
        areaStyle: { color: 'rgba(230, 162, 60, 0.12)' },
      },
    ],
  }
})

// ————— 模型使用分布（空心甜甜圈 + 中心总调用次数）—————
const pieOption = computed(() => {
  const colors = chartColors.value
  const data = (stats.value.modelDistribution ?? []).map((d, i) => ({
    name: d.model,
    value: d.count,
    itemStyle: { color: paletteDonut[i % paletteDonut.length] ?? cPrimary },
  }))
  return {
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: colors.tooltipBg,
      borderColor: colors.axisLine,
      borderWidth: 1,
      textStyle: { color: colors.tooltipText, fontSize: 12 },
      formatter: '{b}<br/>次数：{c} ({d}%)',
    },
    legend: {
      bottom: 0,
      textStyle: { color: colors.legendText, fontSize: 11 },
      itemWidth: 8,
      itemHeight: 8,
      type: 'scroll' as const,
      pageIconColor: cPrimary,
      pageTextStyle: { color: colors.axisText },
    },
    title: {
      text: `${totalModels.value}`,
      subtext: '总调用次数',
      left: 'center',
      top: '38%',
      textStyle: {
        fontSize: 24,
        fontWeight: 700,
        color: colors.tooltipText,
      },
      subtextStyle: {
        fontSize: 11,
        color: colors.axisText,
      },
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['55%', '78%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        padAngle: 1.2,
        itemStyle: {
          borderRadius: 8,
          borderColor: colors.tooltipBg,
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          label: {
            show: true,
            position: 'outside' as const,
            fontSize: 12,
            fontWeight: 700,
            color: colors.tooltipText,
          },
        },
        data,
      },
    ],
  }
})

// ————— 24 小时活跃分布（圆角柱状）—————
const barOption = computed(() => {
  const hours = stats.value.activeHours ?? []
  const colors = chartColors.value
  return {
    tooltip: {
      ...sharedTooltip.value,
      formatter: (params: unknown) => {
        const p = (Array.isArray(params) ? params[0] : params) as {
          axisValue?: string
          value?: number | string
        }
        return `${p?.axisValue ?? ''}<br/>消息数：<b>${p?.value ?? 0}</b>`
      },
    },
    grid: { left: 42, right: 18, top: 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: hours.map((d) => String(d.hour).padStart(2, '0')),
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisLabel: {
        color: colors.axisText,
        fontSize: 9,
        interval: 2,
        formatter: (v: string) => `${v}h`,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: colors.splitLine, type: 'dashed' } },
      axisLabel: { color: colors.axisText, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '消息数',
        type: 'bar' as const,
        barWidth: '58%',
        data: hours.map((d) => d.count),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: cPrimary,
        },
      },
    ],
  }
})

// ═══════════ 记忆试卷 ═══════════
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

// 切换到试卷 Tab 时首次加载试卷列表
watch(activeTab, (tab) => {
  if (tab === 'papers' && papers.value.length === 0 && !papersLoading.value) {
    loadPapers()
  }
})

onMounted(load)
</script>

<template>
  <div class="stats-page">
    <!-- 顶部标题 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-title">
        <h2>知识库功能</h2>
        <p class="toolbar-sub">
          统计已导入知识库数据 · 管理记忆试卷与自测
        </p>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" class="kb-tabs">
      <!-- ══════════ Tab 1：数据统计 ══════════ -->
      <el-tab-pane label="数据统计" name="stats">
        <div v-loading="loading">
          <!-- 空状态 -->
          <el-card v-if="!loading && !stats.totalConversations" shadow="never">
            <el-empty description="暂无统计数据 · 等待首次对话" :image-size="90" />
          </el-card>

          <template v-else>
            <!-- 指标卡 -->
            <el-row :gutter="14" class="metric-row">
              <el-col :xs="12" :sm="12" :lg="6">
                <el-card shadow="hover" class="metric-card">
                  <div class="metric-inner">
                    <div class="metric-icon" style="color: var(--el-color-primary); background: var(--el-color-primary-light-9);">
                      <el-icon :size="20"><ChatDotRound /></el-icon>
                    </div>
                    <el-statistic :value="stats.totalConversations ?? 0" title="对话总数" />
                  </div>
                  <div class="metric-foot">共导入对话数</div>
                </el-card>
              </el-col>
              <el-col :xs="12" :sm="12" :lg="6">
                <el-card shadow="hover" class="metric-card">
                  <div class="metric-inner">
                    <div class="metric-icon" style="color: var(--el-color-success); background: var(--el-color-success-light-9);">
                      <el-icon :size="20"><ChatLineRound /></el-icon>
                    </div>
                    <el-statistic :value="stats.totalMessages ?? 0" title="消息总数" />
                  </div>
                  <div class="metric-foot">全部对话消息数</div>
                </el-card>
              </el-col>
              <el-col :xs="12" :sm="12" :lg="6">
                <el-card shadow="hover" class="metric-card">
                  <div class="metric-inner">
                    <div class="metric-icon" style="color: var(--el-color-warning); background: var(--el-color-warning-light-9);">
                      <el-icon :size="20"><Brush /></el-icon>
                    </div>
                    <el-statistic :value="(stats.modelDistribution ?? []).length" title="模型种类" />
                  </div>
                  <div class="metric-foot">已使用的模型数</div>
                </el-card>
              </el-col>
              <el-col :xs="12" :sm="12" :lg="6">
                <el-card shadow="hover" class="metric-card">
                  <div class="metric-inner">
                    <div class="metric-icon" style="color: var(--el-color-danger); background: var(--el-color-danger-light-9);">
                      <el-icon :size="20"><TrendCharts /></el-icon>
                    </div>
                    <el-statistic :value="(stats.dailyConversations ?? []).length" title="对话总天数" />
                  </div>
                  <div class="metric-foot">有对话的天数</div>
                </el-card>
              </el-col>
            </el-row>

            <!-- 图表区 -->
            <el-card shadow="never" class="chart-card">
              <template #header>
                <div class="card-head">
                  <el-icon :size="15" style="color: var(--el-color-primary);"><TrendCharts /></el-icon>
                  <span>每日消息量趋势</span>
                </div>
              </template>
              <v-chart :option="msgLineOption" autoresize class="chart" />
            </el-card>

            <el-row :gutter="14">
              <el-col :xs="24" :lg="12">
                <el-card shadow="never" class="chart-card">
                  <template #header>
                    <div class="card-head">
                      <el-icon :size="15" style="color: var(--el-color-success);"><ChatDotRound /></el-icon>
                      <span>每日对话数</span>
                    </div>
                  </template>
                  <v-chart :option="convLineOption" autoresize class="chart" />
                </el-card>
              </el-col>
              <el-col :xs="24" :lg="12">
                <el-card shadow="never" class="chart-card">
                  <template #header>
                    <div class="card-head">
                      <el-icon :size="15" style="color: var(--el-color-warning);"><Brush /></el-icon>
                      <span>模型使用分布</span>
                    </div>
                  </template>
                  <v-chart :option="pieOption" autoresize class="chart" />
                </el-card>
              </el-col>
            </el-row>

            <el-card shadow="never" class="chart-card">
              <template #header>
                <div class="card-head">
                  <el-icon :size="15" style="color: var(--el-color-danger);"><Timer /></el-icon>
                  <span>24 小时活跃分布</span>
                </div>
              </template>
              <v-chart :option="barOption" autoresize class="chart" />
            </el-card>
          </template>
        </div>
      </el-tab-pane>

      <!-- ══════════ Tab 2：记忆试卷 ══════════ -->
      <el-tab-pane label="记忆试卷" name="papers">
        <div class="papers-toolbar">
          <el-button type="primary" :icon="MagicStick" size="large" @click="paperGenDialog = true">
            生成记忆试卷
          </el-button>
          <el-button :icon="Refresh" @click="loadPapers">刷新</el-button>
          <span class="papers-tip">基于知识库对话内容，AI 自动生成试卷与参考答案</span>
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
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.toolbar-card {
  margin-bottom: 16px;
}
.toolbar-title h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--el-text-color-primary);
}
.toolbar-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.metric-row {
  margin-bottom: 14px;
}
.metric-card {
  height: 100%;
}
.metric-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}
.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.metric-foot {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.chart-card {
  margin-bottom: 14px;
  height: 100%;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.chart {
  height: 290px;
  width: 100%;
}

/* ══════════ 记忆试卷 ══════════ */
.papers-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.papers-tip {
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
@media (max-width: 768px) {
  .q-options :deep(.el-radio),
  .q-options :deep(.el-checkbox) {
    display: block;
    margin: 4px 0;
  }
}
</style>
