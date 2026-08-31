<script setup lang="ts">
/**
 * 统计分析页（Element Plus 版本）
 *  - 云端模式：GET /stats（后端聚合：会话/消息统计端点，一次返回全部统计数据）
 *  - 本地模式：loadAllConversations(false) 后前端 localStats 计算
 *  - 4 张指标卡（el-card + el-statistic）
 *  - 4 张 ECharts 图表：每日消息量趋势（双折线+面积）、每日对话数（折线+面积）、
 *    模型使用分布（甜甜圈饼图+中心总数）、24 小时活跃分布（柱状图）
 *  - 配色使用 Element Plus 语义色；暗色模式跟随 html.dark 切换文字/分割线颜色
 */
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { request } from '@/utils/request'
import { loadAllConversations } from '@/utils/db'
import type { ParsedConversation } from '@/types'

const auth = useAuthStore()
const theme = useThemeStore()
const loading = ref(false)

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
  if (theme.isDark) {
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

onMounted(load)
</script>

<template>
  <div class="stats-page" v-loading="loading">
    <!-- 顶部工具条 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-title">
        <h2>数据统计</h2>
        <p class="toolbar-sub">
          {{ auth.cloudSyncEnabled ? '云端模式 · 统计服务端已同步的数据' : '本地模式 · 统计浏览器内已导入的数据' }}
        </p>
      </div>
    </el-card>

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
</style>
