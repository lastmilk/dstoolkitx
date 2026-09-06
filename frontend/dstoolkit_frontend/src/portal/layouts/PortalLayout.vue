<script setup lang="ts">
/**
 * PortalLayout.vue（Element Plus 版）
 *  - 门户壳：吸顶导航栏 + 内容 router-view + 页脚
 */
import PortalNavbar from '@/portal/components/PortalNavbar.vue'
import PortalFooter from '@/portal/components/PortalFooter.vue'
</script>

<template>
  <div class="portal-layout">
    <header class="portal-topbar">
      <PortalNavbar />
    </header>
    <main class="portal-main">
      <RouterView />
    </main>
    <PortalFooter />
  </div>
</template>

<style scoped>
.portal-layout {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--el-bg-color);
}
.portal-topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.portal-main {
  flex: 1;
  width: 100%;
}
</style>
