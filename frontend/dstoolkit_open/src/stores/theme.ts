import { defineStore } from 'pinia'

const THEME_KEY = 'dstoolkit_open_theme'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    isDark: localStorage.getItem(THEME_KEY) === 'dark',
  }),
  actions: {
    toggleDark() {
      this.isDark = !this.isDark
      const html = document.documentElement
      if (this.isDark) {
        html.classList.add('dark')
        localStorage.setItem(THEME_KEY, 'dark')
      } else {
        html.classList.remove('dark')
        localStorage.setItem(THEME_KEY, 'light')
      }
    },
    applyInitial() {
      const html = document.documentElement
      if (this.isDark) html.classList.add('dark')
    },
  },
})
