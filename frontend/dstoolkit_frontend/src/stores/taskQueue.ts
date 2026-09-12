/**
 * 任务队列 Pinia store（断电续传 · 通知栏小红点）。
 *
 * 职责：
 *  - 轮询活跃任务数（pending/processing）→ 驱动右上角小红点
 *  - 拉取任务列表 → 通知栏下拉展示（等待中/执行中/完成/失败）
 *  - 仅登录用户启动轮询；登出/未登录时停止
 */
import { defineStore } from 'pinia'
import { request } from '@/utils/request'
import { useAuthStore } from '@/stores/auth'

export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface TaskRecord {
  id: number
  userId: number
  type: string
  status: TaskStatus
  progress: number
  total: number
  current: number
  message: string | null
  result: unknown
  error: string | null
  gitRepoId: number | null
  payload: unknown
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

const POLL_INTERVAL = 4000 // 小红点轮询间隔

export const useTaskQueueStore = defineStore('taskQueue', {
  state: () => ({
    activeCount: 0,
    tasks: [] as TaskRecord[],
    /** 下拉是否展开（展开时拉取完整列表） */
    panelOpen: false,
    _timer: null as ReturnType<typeof setInterval> | null,
    _listTimer: null as ReturnType<typeof setInterval> | null,
  }),
  getters: {
    /** 是否显示小红点 */
    hasActive: (s) => s.activeCount > 0,
    pendingTasks: (s) => s.tasks.filter((t) => t.status === 'pending'),
    processingTasks: (s) => s.tasks.filter((t) => t.status === 'processing'),
    doneTasks: (s) => s.tasks.filter((t) => t.status === 'done'),
    failedTasks: (s) => s.tasks.filter((t) => t.status === 'failed'),
    sortedTasks: (s) =>
      [...s.tasks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  },
  actions: {
    /** 启动轮询（登录后调用） */
    startPolling() {
      this.stopPolling()
      this.refreshActiveCount()
      this._timer = setInterval(() => this.refreshActiveCount(), POLL_INTERVAL)
    },
    /** 停止轮询（登出时调用） */
    stopPolling() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
      if (this._listTimer) {
        clearInterval(this._listTimer)
        this._listTimer = null
      }
      this.activeCount = 0
      this.tasks = []
      this.panelOpen = false
    },
    /** 拉取活跃任务数（小红点） */
    async refreshActiveCount() {
      const auth = useAuthStore()
      if (!auth.isLoggedIn) return
      try {
        const res = (await request.get('/git-repos/tasks/active-count')) as { count: number }
        this.activeCount = res.count
        // 有活跃任务时顺带刷新列表
        if (res.count > 0) {
          this.refreshTasks()
        }
      } catch {
        /* 静默失败（未登录时 401 已由拦截器处理） */
      }
    },
    /** 拉取任务列表 */
    async refreshTasks() {
      const auth = useAuthStore()
      if (!auth.isLoggedIn) return
      try {
        const res = (await request.get('/git-repos/tasks')) as { tasks: TaskRecord[] }
        this.tasks = res.tasks
      } catch {
        /* 静默 */
      }
    },
    /** 打开/关闭通知面板 */
    async togglePanel(open: boolean) {
      this.panelOpen = open
      if (open) {
        await this.refreshTasks()
        // 面板打开时高频刷新（2s）
        if (!this._listTimer) {
          this._listTimer = setInterval(() => this.refreshTasks(), 2000)
        }
      } else {
        if (this._listTimer) {
          clearInterval(this._listTimer)
          this._listTimer = null
        }
      }
    },
  },
})
