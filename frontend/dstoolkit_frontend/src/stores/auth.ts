import { defineStore } from 'pinia'
import { request } from '@/utils/request'
import { clearCloudSearchCache } from '@/utils/db'

const TOKEN_KEY = 'dstoolkit_token'

export type Tier = 'FREE' | 'PRO' | 'PLUS' | 'ULTIMATE'

export interface User {
  id: number
  username: string
  role: string
  cloudSyncEnabled: boolean
  createdAt?: string
  tier?: Tier
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: (localStorage.getItem(TOKEN_KEY) || '') as string,
    user: null as User | null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'ADMIN',
    cloudSyncEnabled: (s) => !!s.user?.cloudSyncEnabled,
    effectiveTier: (s): Tier => s.user?.tier ?? 'FREE',
  },
  actions: {
    setToken(t: string) {
      this.token = t
      localStorage.setItem(TOKEN_KEY, t)
    },
    async login(username: string, password: string) {
      const res: any = await request.post('/auth/login', { username, password })
      this.setToken(res.token)
      this.user = res.user
      return res
    },
    async register(username: string, password: string) {
      const res: any = await request.post('/auth/register', { username, password })
      this.setToken(res.token)
      this.user = res.user
      return res
    },
    async fetchMe() {
      const res: any = await request.get('/auth/me')
      this.user = res.user
      return res.user as User
    },
    async updateProfile(username: string) {
      await request.put('/auth/profile', { username })
      if (this.user) this.user.username = username
    },
    async changePassword(oldPassword: string, newPassword: string) {
      await request.put('/auth/password', { oldPassword, newPassword })
    },
    async setCloudSync(enabled: boolean) {
      const res: any = await request.put('/auth/cloud-sync', { enabled })
      if (this.user) this.user.cloudSyncEnabled = res.cloudSyncEnabled
      return res.cloudSyncEnabled as boolean
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
      clearCloudSearchCache()
    },
  },
})
