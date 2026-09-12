import { defineStore } from 'pinia'
import { request } from '@/utils/request'
import { clearCloudSearchCache } from '@/utils/db'
import type { GeetestParams } from '@/utils/geetest'
import { useTaskQueueStore } from '@/stores/taskQueue'

const TOKEN_KEY = 'dstoolkit_token'

export type Tier = 'FREE' | 'PRO' | 'PLUS' | 'ULTIMATE'

export type RegistrationType = 'LEGACY' | 'USERNAME_PASSWORD' | 'PHONE'

export interface User {
  id: number
  username: string
  role: string
  cloudSyncEnabled: boolean
  createdAt?: string
  tier?: Tier
  /** 脱敏手机号（138****1234），未绑定为 null */
  phone?: string | null
  phoneVerifiedAt?: string | null
  registrationType?: RegistrationType
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
    /** 新传统注册用户未绑定手机号：云端模式受限（与后端 needsPhoneForCloud 对应） */
    needsPhoneForCloud: (s): boolean =>
      s.user?.registrationType === 'USERNAME_PASSWORD' && !s.user?.phone,
  },
  actions: {
    setToken(t: string) {
      this.token = t
      localStorage.setItem(TOKEN_KEY, t)
    },
    applyAuth(res: { token: string; user: User }) {
      this.setToken(res.token)
      this.user = res.user
      // 登录/注册后启动任务队列轮询（驱动右上角小红点）
      useTaskQueueStore().startPolling()
    },
    async login(username: string, password: string, captcha?: GeetestParams) {
      const res: any = await request.post('/auth/login', { username, password, captcha })
      this.applyAuth(res)
      return res
    },
    async register(username: string, password: string, captcha?: GeetestParams) {
      const res: any = await request.post('/auth/register', { username, password, captcha })
      this.applyAuth(res)
      return res
    },
    /** 发送登录/注册短信验证码（需先完成极验） */
    async smsSend(phone: string, captcha: GeetestParams) {
      await request.post('/auth/sms/send', { phone, captcha })
    },
    /** 发送绑定手机号验证码（需先完成极验） */
    async phoneSendCode(phone: string, captcha: GeetestParams) {
      await request.post('/auth/phone/send-code', { phone, captcha })
    },
    /** 短信验证码登录（新手机号自动注册） */
    async smsLogin(phone: string, code: string) {
      const res: any = await request.post('/auth/sms/login', { phone, code })
      this.applyAuth(res)
      return res
    },
    /** 绑定手机号，成功后刷新用户信息 */
    async bindPhone(phone: string, code: string) {
      await request.post('/auth/phone/bind', { phone, code })
      await this.fetchMe()
    },
    async fetchMe() {
      const res: any = await request.get('/auth/me')
      this.user = res.user
      // 页面刷新后 token 已存在但 store 未启动轮询，这里补启
      useTaskQueueStore().startPolling()
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
      // 登出时停止任务队列轮询
      useTaskQueueStore().stopPolling()
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
      clearCloudSearchCache()
    },
  },
})
