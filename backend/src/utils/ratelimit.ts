// 内存滑动窗口限流（单实例部署足够；重启即清空，可接受）
interface Window {
  timestamps: number[]
}

const windows = new Map<string, Window>()
let lastSweep = Date.now()

function sweep(now: number, maxAgeMs: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, win] of windows) {
    win.timestamps = win.timestamps.filter((t) => now - t < maxAgeMs)
    if (win.timestamps.length === 0) windows.delete(key)
  }
}

/**
 * 命中限流返回 false（超限），否则记录并返回 true。
 * 例：hit(`sms:${phone}`, 60_000, 1) —— 同手机号 60s 内最多 1 次
 */
export function hit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now()
  sweep(now, windowMs)
  let win = windows.get(key)
  if (!win) {
    win = { timestamps: [] }
    windows.set(key, win)
  }
  win.timestamps = win.timestamps.filter((t) => now - t < windowMs)
  if (win.timestamps.length >= max) return false
  win.timestamps.push(now)
  return true
}
