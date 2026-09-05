import axios from 'axios'
import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'dstoolkit_token'

/** 读取当前登录态 JWT（Git 内置同步等非 axios 场景复用） */
export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export const request = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers = config.headers || {}
    ;(config.headers as any).Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (res) => res.data as any,
  (error) => {
    const msg = error?.response?.data?.error || error?.message || '请求失败'
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      ElMessage.error('登录已过期，请重新登录')
      if (location.pathname !== '/login') {
        setTimeout(() => (location.href = '/login'), 400)
      }
    } else {
      ElMessage.error(msg)
    }
    return Promise.reject(error)
  },
)
