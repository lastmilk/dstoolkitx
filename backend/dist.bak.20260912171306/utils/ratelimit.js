const windows = new Map();
let lastSweep = Date.now();
function sweep(now, maxAgeMs) {
    if (now - lastSweep < 60_000)
        return;
    lastSweep = now;
    for (const [key, win] of windows) {
        win.timestamps = win.timestamps.filter((t) => now - t < maxAgeMs);
        if (win.timestamps.length === 0)
            windows.delete(key);
    }
}
/**
 * 命中限流返回 false（超限），否则记录并返回 true。
 * 例：hit(`sms:${phone}`, 60_000, 1) —— 同手机号 60s 内最多 1 次
 */
export function hit(key, windowMs, max) {
    const now = Date.now();
    sweep(now, windowMs);
    let win = windows.get(key);
    if (!win) {
        win = { timestamps: [] };
        windows.set(key, win);
    }
    win.timestamps = win.timestamps.filter((t) => now - t < windowMs);
    if (win.timestamps.length >= max)
        return false;
    win.timestamps.push(now);
    return true;
}
//# sourceMappingURL=ratelimit.js.map