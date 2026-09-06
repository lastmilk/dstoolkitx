import { defineStore } from 'pinia'
import { request } from '@/utils/request'

const TOKEN_KEY = 'dstoolkit_token'

export type Tier = 'FREE' | 'PRO' | 'PLUS' | 'ULTIMATE'

export interface User {
  id: number
  username: string
  role: string
  cloudSyncEnabled: boolean
  createdAt?: string
  tier?: Tier
  phone?: string | null
  phoneVerifiedAt?: string | null
  registrationType?: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: (localStorage.getItem(TOKEN_KEY) || '') as string,
    user: null as User | null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'ADMIN',
  },
  actions: {
    setToken(t: string) {
      this.token = t
      localStorage.setItem(TOKEN_KEY, t)
    },
    applyAuth(res: { token: string; user: User }) {
      this.setToken(res.token)
      this.user = res.user
    },
    async login(username: string, password: string) {
      const res: any = await request.post('/auth/login', { username, password })
      this.applyAuth(res)
      return res
    },
    async fetchMe() {
      const res: any = await request.get('/auth/me')
      this.user = res.user
      return res.user as User
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
