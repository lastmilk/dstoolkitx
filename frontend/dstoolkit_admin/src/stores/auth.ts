import { defineStore } from 'pinia'
import { request } from '@/utils/request'

const TOKEN_KEY = 'dstoolkit_admin_token'

export interface AdminUser {
  id: number
  username: string
  role: string
  cloudSyncEnabled: boolean
}

export const useAuthStore = defineStore('adminAuth', {
  state: () => ({
    token: (localStorage.getItem(TOKEN_KEY) || '') as string,
    user: null as AdminUser | null,
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
    async login(username: string, password: string) {
      const res: any = await request.post('/auth/login', { username, password })
      if (res.user.role !== 'ADMIN') {
        throw new Error('该账号没有管理员权限')
      }
      this.setToken(res.token)
      this.user = res.user
      return res
    },
    async fetchMe() {
      const res: any = await request.get('/auth/me')
      this.user = res.user
      return res.user as AdminUser
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
