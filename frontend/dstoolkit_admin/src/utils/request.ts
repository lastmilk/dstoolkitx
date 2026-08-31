import axios from 'axios'
import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'dstoolkit_admin_token'

export const request = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

request.interceptors.request.use((config) => {
  const t = localStorage.getItem(TOKEN_KEY)
  if (t) {
    config.headers = config.headers || {}
    ;(config.headers as any).Authorization = `Bearer ${t}`
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
