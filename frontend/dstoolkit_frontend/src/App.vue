<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useStyleStore } from '@/stores/style'
import ParticleCanvas from '@/components/ParticleCanvas.vue'

// 全局壁纸图层（fixed 置于内容之下，透明度/模糊由样式设置控制）
const styleStore = useStyleStore()
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <div
      class="app-wallpaper"
      aria-hidden="true"
      :style="{ backgroundImage: styleStore.wallpaperUrl ? `url(${styleStore.wallpaperUrl})` : 'none' }"
    />
    <ParticleCanvas v-if="styleStore.settings.particlesEnabled" />
    <router-view />
  </ElConfigProvider>
</template>
