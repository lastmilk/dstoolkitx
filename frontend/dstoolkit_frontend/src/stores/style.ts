/**
 * 样式 Store
 *  - 背景图：无背景 / 随机 ACG / 必应壁纸 / 自定义壁纸（≤15MB，存 IndexedDB）
 *  - 控件透明度：卡片/侧栏/顶栏等表面 alpha（磨砂玻璃效果，配 backdrop-filter）
 *  - 背景图透明度：壁纸图层可见度
 *  - 字体：HarmonyOS Sans（index.html 引入 B 站 CDN 分片字体）+ 字号缩放（--app-font-scale）
 *  - 持久化：设置存 localStorage，壁纸二进制存 IndexedDB
 */
import { defineStore } from 'pinia'
import { watch } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { saveStyleValue, loadStyleValue, deleteStyleValue } from '@/utils/db'

const SETTINGS_KEY = 'dstoolkit_style'

export type WallpaperType = 'none' | 'acg' | 'bing' | 'custom'
export type FontSizeId = 'small' | 'medium' | 'large' | 'xlarge'
export type ParticleDensity = 'sparse' | 'normal' | 'dense'
/** 粒子样式：连线网络 / 漂浮气泡 / 浪漫雪花 / 闪烁星光 */
export type ParticleStyle = 'network' | 'bubble' | 'snow' | 'sparkle'

/** 粒子数量映射（按密度档位） */
export const PARTICLE_COUNT: Record<ParticleDensity, number> = {
  sparse: 35,
  normal: 70,
  dense: 120,
}

export const PARTICLE_DENSITY_OPTIONS: Array<{ label: string; value: ParticleDensity }> = [
  { label: '稀疏', value: 'sparse' },
  { label: '适中', value: 'normal' },
  { label: '密集', value: 'dense' },
]

export const PARTICLE_STYLE_OPTIONS: Array<{ label: string; value: ParticleStyle }> = [
  { label: '连线', value: 'network' },
  { label: '气泡', value: 'bubble' },
  { label: '雪花', value: 'snow' },
  { label: '星光', value: 'sparkle' },
]

/** 背景模糊上限（px），0 = 不模糊 */
export const WALLPAPER_BLUR_MAX = 60

export const FONT_SIZE_OPTIONS: Array<{ label: string; value: FontSizeId }> = [
  { label: '小', value: 'small' },
  { label: '标准', value: 'medium' },
  { label: '大', value: 'large' },
  { label: '特大', value: 'xlarge' },
]

/** 字号缩放系数（作用于 EP 字体变量 + body 基准字号） */
const FONT_SCALE: Record<FontSizeId, number> = {
  small: 0.9,
  medium: 1,
  large: 1.1,
  xlarge: 1.25,
}

const ACG_API = 'https://www.loliapi.com/acg/?type=img'
const BING_API = 'https://api.bimg.cc/random?w=1920&h=1080&mkt=zh-CN'
const CUSTOM_WALLPAPER_KEY = 'customWallpaper'
/** 自定义壁纸大小上限 15MB */
export const WALLPAPER_MAX_BYTES = 15 * 1024 * 1024

interface StyleSettings {
  wallpaperType: WallpaperType
  /** 控件透明度（表面不透明度 %，100 = 完全不透明） */
  surfaceOpacity: number
  /** 背景图不透明度 % */
  wallpaperOpacity: number
  /** 背景图模糊度 px（0 = 不模糊） */
  wallpaperBlur: number
  fontSize: FontSizeId
  /** 粒子效果开关 */
  particlesEnabled: boolean
  /** 粒子密度档位 */
  particleDensity: ParticleDensity
  /** 粒子样式 */
  particleStyle: ParticleStyle
}

const DEFAULTS: StyleSettings = {
  wallpaperType: 'none',
  surfaceOpacity: 100,
  wallpaperOpacity: 100,
  wallpaperBlur: 0,
  fontSize: 'medium',
  particlesEnabled: false,
  particleDensity: 'normal',
  particleStyle: 'network',
}

function loadSettings(): StyleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<StyleSettings>
    return {
      wallpaperType: (['none', 'acg', 'bing', 'custom'] as const).includes(parsed.wallpaperType as never)
        ? (parsed.wallpaperType as WallpaperType)
        : DEFAULTS.wallpaperType,
      surfaceOpacity: clampPercent(parsed.surfaceOpacity, DEFAULTS.surfaceOpacity),
      wallpaperOpacity: clampPercent(parsed.wallpaperOpacity, DEFAULTS.wallpaperOpacity),
      wallpaperBlur: clampBlur(parsed.wallpaperBlur, DEFAULTS.wallpaperBlur),
      fontSize: FONT_SCALE[parsed.fontSize as FontSizeId] ? (parsed.fontSize as FontSizeId) : DEFAULTS.fontSize,
      particlesEnabled: typeof parsed.particlesEnabled === 'boolean' ? parsed.particlesEnabled : DEFAULTS.particlesEnabled,
      particleDensity: PARTICLE_COUNT[parsed.particleDensity as ParticleDensity]
        ? (parsed.particleDensity as ParticleDensity)
        : DEFAULTS.particleDensity,
      particleStyle: PARTICLE_STYLE_OPTIONS.some((o) => o.value === parsed.particleStyle)
        ? (parsed.particleStyle as ParticleStyle)
        : DEFAULTS.particleStyle,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function clampPercent(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, Math.round(n)))
}

function clampBlur(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(WALLPAPER_BLUR_MAX, Math.max(0, Math.round(n)))
}

/** 解析 CSS 颜色为 [r,g,b]（支持 #rgb/#rrggbb/rgb()/rgba()） */
function parseRgb(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c)
  if (hex) {
    const h = hex[1] ?? ''
    const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ]
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(c)
  if (fn) {
    const parts = (fn[1] ?? '').split(/[,/\s]+/).filter(Boolean)
    const r = Number(parts[0])
    const g = Number(parts[1])
    const b = Number(parts[2])
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b]
  }
  return null
}

/** 参与「控件透明度」的表面变量（侧栏/顶栏/内容区/卡片/输入底色） */
const SURFACE_VARS = [
  '--el-bg-color',
  '--el-bg-color-overlay',
  '--el-bg-color-page',
  '--el-fill-color-blank',
] as const

export const useStyleStore = defineStore('style', {
  state: () => ({
    settings: loadSettings(),
    /** 当前壁纸图层 URL（objectURL 或直链）；null = 无壁纸 */
    wallpaperUrl: null as string | null,
    wallpaperLoading: false,
    wallpaperError: false,
  }),

  actions: {
    /** 应用启动时调用（main.ts，主题初始化之后） */
    init() {
      const theme = useThemeStore()
      // 亮暗切换会改写 EP 颜色变量 → 重新按基准色计算透明度
      watch(
        () => theme.isDark,
        () => requestAnimationFrame(() => this.applySurfaceAlpha()),
      )
      watch(
        () => ({ ...this.settings }),
        () => {
          this.persist()
          this.applyToDom()
        },
        { deep: true },
      )
      void this.refreshWallpaper(true)
      this.applyToDom()
    },

    persist() {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    },

    setWallpaper(type: WallpaperType) {
      this.settings.wallpaperType = type
      // 选择壁纸但表面仍全不透明时，自动降低控件透明度让壁纸可见
      if (type !== 'none' && this.settings.surfaceOpacity >= 100) {
        this.settings.surfaceOpacity = 75
      }
    },

    /** 拉取/切换壁纸图层（首次加载或点「换一张」时 force=true 重新随机） */
    async refreshWallpaper(initial = false) {
      const type = this.settings.wallpaperType
      if (type === 'none') {
        this.releaseUrl()
        this.wallpaperUrl = null
        this.applyToDom()
        return
      }
      if (type === 'custom') {
        const blob = await loadStyleValue<Blob>(CUSTOM_WALLPAPER_KEY)
        if (blob) {
          this.releaseUrl()
          this.wallpaperUrl = URL.createObjectURL(blob)
          this.wallpaperError = false
        } else {
          this.wallpaperError = !initial
        }
        this.applyToDom()
        return
      }
      // acg / bing：随机图。优先 fetch 成 blob（可控缓存 + 可 revoke），
      // 跨域不允许时退回直链（背景图展示不需要 CORS）。
      const api = type === 'acg' ? ACG_API : BING_API
      this.wallpaperLoading = true
      try {
        const res = await fetch(api, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        if (!blob.type.startsWith('image/')) throw new Error('not image')
        this.releaseUrl()
        this.wallpaperUrl = URL.createObjectURL(blob)
        this.wallpaperError = false
      } catch {
        this.releaseUrl()
        this.wallpaperUrl = `${api}&_t=${Date.now()}`
        this.wallpaperError = !initial
      } finally {
        this.wallpaperLoading = false
        this.applyToDom()
      }
    },

    async setCustomWallpaper(file: File) {
      if (file.size > WALLPAPER_MAX_BYTES) {
        throw new Error('壁纸图片不能超过 15MB')
      }
      if (!file.type.startsWith('image/')) {
        throw new Error('请选择图片文件')
      }
      await saveStyleValue(CUSTOM_WALLPAPER_KEY, file)
      this.settings.wallpaperType = 'custom'
      await this.refreshWallpaper()
    },

    async clearCustomWallpaper() {
      await deleteStyleValue(CUSTOM_WALLPAPER_KEY)
      if (this.settings.wallpaperType === 'custom') {
        this.settings.wallpaperType = 'none'
        this.wallpaperUrl = null
        this.applyToDom()
      }
    },

    resetAll() {
      this.settings = { ...DEFAULTS }
      void deleteStyleValue(CUSTOM_WALLPAPER_KEY)
    },

    releaseUrl() {
      const url = this.wallpaperUrl
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
    },

    /** 把字号缩放 / 壁纸类名 / 透明度与模糊变量写入 documentElement */
    applyToDom() {
      if (typeof document === 'undefined') return
      const html = document.documentElement
      html.style.setProperty('--app-font-scale', String(FONT_SCALE[this.settings.fontSize]))
      html.style.setProperty('--app-wallpaper-opacity', String(this.settings.wallpaperOpacity / 100))
      html.style.setProperty('--app-wallpaper-blur', `${this.settings.wallpaperBlur}px`)
      html.style.setProperty('--app-surface-alpha', String(this.settings.surfaceOpacity / 100))
      const hasWallpaper = this.settings.wallpaperType !== 'none' && !!this.wallpaperUrl
      html.classList.toggle('has-wallpaper', hasWallpaper)
      requestAnimationFrame(() => this.applySurfaceAlpha())
    },

    /** 依据当前主题的基准色计算带 alpha 的表面色（控件透明度） */
    applySurfaceAlpha() {
      if (typeof document === 'undefined') return
      const html = document.documentElement
      const inline = html.style
      const alpha = this.settings.surfaceOpacity / 100
      // 先移除旧的内联覆盖，读取主题类（html.dark）定义的基准色
      for (const v of SURFACE_VARS) inline.removeProperty(v)
      if (alpha >= 0.999) return
      const cs = getComputedStyle(html)
      for (const v of SURFACE_VARS) {
        const rgb = parseRgb(cs.getPropertyValue(v))
        if (!rgb) continue
        inline.setProperty(v, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`)
      }
    },
  },
})
