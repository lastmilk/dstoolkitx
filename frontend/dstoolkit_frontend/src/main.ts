import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'sweetalert2/dist/sweetalert2.min.css'
import 'vue-element-plus-x/styles/index.css'
import './styles/global.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  LineChart, BarChart, PieChart, RadarChart, ScatterChart,
  BoxplotChart, CandlestickChart, EffectScatterChart, FunnelChart, GaugeChart,
  HeatmapChart, PictorialBarChart, SankeyChart, SunburstChart,
} from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  DataZoomComponent, VisualMapComponent, ToolboxComponent,
} from 'echarts/components'

import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'
import { useStyleStore } from '@/stores/style'

// 注册 ECharts 模块
use([
  CanvasRenderer,
  LineChart, BarChart, PieChart, RadarChart, ScatterChart,
  BoxplotChart, CandlestickChart, EffectScatterChart, FunnelChart, GaugeChart,
  HeatmapChart, PictorialBarChart, SankeyChart, SunburstChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  DataZoomComponent, VisualMapComponent, ToolboxComponent,
])

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, {
  locale: zhCn,
  size: 'default',
})
// 全局注册 Element Plus 图标（模板里直接 <User /> 等使用）
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp as any)
}
// vue-echarts 全局注册
app.component('VChart', ECharts)

// 主题初始化（亮/暗）
const themeStore = useThemeStore()
themeStore.init()

// 样式系统初始化（壁纸 / 透明度 / 字号，需在主题之后）
useStyleStore().init()

app.mount('#app')
