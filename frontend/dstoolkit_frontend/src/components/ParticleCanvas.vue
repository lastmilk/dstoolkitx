<script setup lang="ts">
/**
 * ParticleCanvas 背景粒子效果
 *  - 四种样式：连线网络 / 漂浮气泡 / 浪漫雪花 / 闪烁星光
 *  - 2D Canvas + rAF，随窗口自适应；颜色跟随主题（雪花按亮暗自适应）
 *  - pointer-events: none，不拦截任何交互；密度/样式由 stores/style.ts 控制
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useThemeStore } from '@/stores/theme'
import {
  useStyleStore,
  PARTICLE_COUNT,
  type ParticleStyle,
} from '@/stores/style'

const themeStore = useThemeStore()
const styleStore = useStyleStore()

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alpha: number
  /** 闪烁/摆动相位 */
  phase: number
  /** 闪烁/摆动速度 */
  speed: number
}

const LINK_DIST = 120
const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let rafId = 0
let frame = 0
let cssW = 0
let cssH = 0
/** 主题主色，形如 [r, g, b] */
let tint: [number, number, number] = [64, 158, 255]

function readTint() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)
  if (hex?.[1]) {
    const h = hex[1]
    tint = [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]
  }
}

/** 雪花颜色：暗色主题用纯白，亮色主题用淡蓝灰（否则白点在白底上不可见） */
function snowTint(): [number, number, number] {
  return themeStore.isDark ? [240, 246, 255] : [122, 148, 196]
}

function spawn(style: ParticleStyle, count: number) {
  particles = Array.from({ length: count }, () => {
    const base = {
      x: Math.random() * cssW,
      y: Math.random() * cssH,
      vx: 0,
      vy: 0,
      r: 1.4,
      alpha: 0.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.8,
    }
    if (style === 'network') {
      return {
        ...base,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.8,
        alpha: 0.35 + Math.random() * 0.4,
      }
    }
    if (style === 'bubble') {
      return {
        ...base,
        vy: -(0.3 + Math.random() * 0.7),
        vx: 0,
        r: 2 + Math.random() * 4.5,
        alpha: 0.12 + Math.random() * 0.22,
      }
    }
    if (style === 'snow') {
      return {
        ...base,
        vy: 0.4 + Math.random() * 0.8,
        vx: 0,
        r: 1.2 + Math.random() * 2.2,
        alpha: 0.4 + Math.random() * 0.5,
      }
    }
    // sparkle：近乎静止的闪烁光点
    return {
      ...base,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08,
      r: 1 + Math.random() * 1.6,
      alpha: 0.3 + Math.random() * 0.5,
      speed: 0.4 + Math.random() * 1.2,
    }
  })
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cssW = window.innerWidth
  cssH = window.innerHeight
  if (!canvasRef.value) return
  canvasRef.value.width = Math.round(cssW * dpr)
  canvasRef.value.height = Math.round(cssH * dpr)
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** 四芒星光斑（sparkle 用） */
function drawSparkle(p: Particle, color: string) {
  if (!ctx) return
  const s = p.r * (2.2 + Math.sin(frame * 0.03 * p.speed + p.phase) * 0.6)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(p.x - s, p.y)
  ctx.lineTo(p.x + s, p.y)
  ctx.moveTo(p.x, p.y - s)
  ctx.lineTo(p.x, p.y + s)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(p.r * 0.55, 0.8), 0, Math.PI * 2)
  ctx.fill()
}

function step() {
  if (!ctx) return
  ctx.clearRect(0, 0, cssW, cssH)
  const style = styleStore.settings.particleStyle
  frame++

  const [tr, tg, tb] = style === 'snow' ? snowTint() : tint
  const rgb = `${tr}, ${tg}, ${tb}`

  // 连线仅 network 样式
  if (style === 'network') {
    ctx.lineWidth = 1
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i]!
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j]!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 > LINK_DIST * LINK_DIST) continue
        const fade = 1 - Math.sqrt(d2) / LINK_DIST
        ctx.strokeStyle = `rgba(${rgb}, ${(0.18 * fade).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }

  for (const p of particles) {
    switch (style) {
      case 'network': {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -20) p.x = cssW + 20
        else if (p.x > cssW + 20) p.x = -20
        if (p.y < -20) p.y = cssH + 20
        else if (p.y > cssH + 20) p.y = -20
        ctx!.fillStyle = `rgba(${rgb}, ${p.alpha.toFixed(3)})`
        break
      }
      case 'bubble': {
        p.y += p.vy
        p.x += Math.sin(frame * 0.02 * p.speed + p.phase) * 0.3
        if (p.y < -20) {
          p.y = cssH + 20
          p.x = Math.random() * cssW
        }
        // 气泡：圆环 + 高光
        ctx!.strokeStyle = `rgba(${rgb}, ${(p.alpha * 1.6).toFixed(3)})`
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.stroke()
        ctx!.fillStyle = `rgba(${rgb}, ${(p.alpha * 0.35).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.25, 0, Math.PI * 2)
        ctx!.fill()
        continue
      }
      case 'snow': {
        p.y += p.vy
        p.x += Math.sin(frame * 0.015 * p.speed + p.phase) * 0.5
        if (p.y > cssH + 20) {
          p.y = -20
          p.x = Math.random() * cssW
        }
        if (p.x < -20) p.x = cssW + 20
        else if (p.x > cssW + 20) p.x = -20
        ctx!.fillStyle = `rgba(${rgb}, ${p.alpha.toFixed(3)})`
        break
      }
      case 'sparkle': {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -20) p.x = cssW + 20
        else if (p.x > cssW + 20) p.x = -20
        if (p.y < -20) p.y = cssH + 20
        else if (p.y > cssH + 20) p.y = -20
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(frame * 0.02 * p.speed + p.phase))
        drawSparkle(p, `rgba(${rgb}, ${(p.alpha * twinkle).toFixed(3)})`)
        continue
      }
    }
    ctx!.beginPath()
    ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx!.fill()
  }

  rafId = requestAnimationFrame(step)
}

/** 样式/密度变化：重建粒子 */
watch(
  [() => styleStore.settings.particleStyle, () => styleStore.settings.particleDensity],
  ([style, density]) => spawn(style, PARTICLE_COUNT[density] ?? PARTICLE_COUNT.normal),
)

// 亮暗切换：主题主色 / 雪花颜色更新
watch(
  () => themeStore.isDark,
  () => readTint(),
)

onMounted(() => {
  ctx = canvasRef.value?.getContext('2d') ?? null
  window.addEventListener('resize', resize)
  readTint()
  resize()
  spawn(styleStore.settings.particleStyle, PARTICLE_COUNT[styleStore.settings.particleDensity] ?? PARTICLE_COUNT.normal)
  rafId = requestAnimationFrame(step)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas ref="canvasRef" class="particle-canvas" aria-hidden="true" />
</template>
