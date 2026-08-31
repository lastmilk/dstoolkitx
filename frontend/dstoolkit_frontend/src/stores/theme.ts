/**
 * 主题 Store
 *  - 亮 / 暗 两档 + 跟随系统（auto）
 *  - 暗色通过 html.dark 激活 Element Plus 深色 CSS 变量
 *  - 持久化：localStorage
 */
import { defineStore } from 'pinia'
import { watch } from 'vue'

const MODE_KEY = 'dstoolkit_theme'
// 兼容旧版持久化值：ocean/forest/mono 等一律映射为 light
function normalize(id: string | null): 'light' | 'dark' {
  return id === 'dark' ? 'dark' : 'light'
}

export type ThemeMode = 'auto' | 'manual'
export type ThemeId = 'light' | 'dark'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    selectedId: normalize(localStorage.getItem('dstoolkit_theme_id')) as ThemeId,
    mode: (localStorage.getItem('dstoolkit_theme_mode') as ThemeMode) || 'auto',
    systemDark: false,
  }),
  getters: {
    effectiveId(state): ThemeId {
      if (state.mode === 'auto') return state.systemDark ? 'dark' : 'light'
      return state.selectedId
    },
    isDark(): boolean {
      return this.effectiveId === 'dark'
    },
  },
  actions: {
    init() {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mql = window.matchMedia('(prefers-color-scheme: dark)')
        this.systemDark = mql.matches
        const listener = (e: MediaQueryListEvent) => { this.systemDark = e.matches }
        if (typeof mql.addEventListener === 'function') mql.addEventListener('change', listener)
        else if (typeof (mql as any).addListener === 'function') (mql as any).addListener(listener)
      }
      watch(
        () => [this.mode, this.selectedId, this.systemDark] as const,
        () => {
          this.applyToDom()
          localStorage.setItem('dstoolkit_theme_id', this.selectedId)
          localStorage.setItem('dstoolkit_theme_mode', this.mode)
        },
        { immediate: true }
      )
    },
    setTheme(id: ThemeId) {
      this.mode = 'manual'
      this.selectedId = id
    },
    setMode(mode: ThemeMode) { this.mode = mode },
    toggleDark() {
      this.setTheme(this.isDark ? 'light' : 'dark')
    },
    applyToDom() {
      if (typeof document === 'undefined') return
      const html = document.documentElement
      if (this.isDark) html.classList.add('dark')
      else html.classList.remove('dark')
    },
  },
})
