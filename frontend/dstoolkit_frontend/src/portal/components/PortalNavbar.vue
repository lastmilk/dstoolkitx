<script setup lang="ts">
/**
 * PortalNavbar.vue（Element Plus 版）
 *  - 品牌区 + Home / Features / Pricing 导航 + 登录 / 注册按钮
 *  - 窄屏（<960px）折叠为抽屉菜单
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import TaskNotification from '@/components/TaskNotification.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const drawerVisible = ref(false)
const isMobile = ref(false)

interface NavItem {
  label: string
  path: string
}
const navItems: NavItem[] = [
  { label: 'Home', path: '/portal' },
  { label: 'Features', path: '/portal/features' },
  { label: 'Pricing', path: '/portal/pricing' },
]

const activePath = computed(() => route.path)

function isActive(path: string): boolean {
  if (path === '/portal') {
    return route.path === '/portal'
  }
  return route.path.startsWith(path)
}

function navigate(path: string) {
  router.push(path)
  drawerVisible.value = false
}

function checkViewport() {
  isMobile.value = window.innerWidth < 960
}
onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})
</script>

<template>
  <div class="portal-navbar">
    <div class="navbar-inner">
      <div class="navbar-brand" @click="navigate('/portal')">
        <el-icon :size="22" class="brand-icon"><MagicStick /></el-icon>
        <span class="brand-name">Deepseek Toolkit</span>
        <!-- 任务队列通知小红点（仅登录用户显示，紧邻品牌右侧） -->
        <TaskNotification v-if="auth.isLoggedIn" class="brand-task-notif" @click.stop />
      </div>

      <nav v-if="!isMobile" class="navbar-links">
        <a
          v-for="item in navItems"
          :key="item.path"
          class="nav-link"
          :class="{ active: isActive(item.path) }"
          @click.prevent="navigate(item.path)"
        >
          {{ item.label }}
        </a>
      </nav>

      <div v-if="!isMobile" class="navbar-actions">
        <el-button text @click="router.push('/login')">Login</el-button>
        <el-button type="primary" round @click="router.push('/register')">Register</el-button>
      </div>

      <el-button
        v-if="isMobile"
        text
        class="hamburger-btn"
        aria-label="打开菜单"
        @click="drawerVisible = true"
      >
        <el-icon :size="20"><Menu /></el-icon>
      </el-button>
    </div>

    <el-drawer
      v-model="drawerVisible"
      direction="rtl"
      :with-header="false"
      size="280px"
      class="portal-drawer"
    >
      <div class="drawer-inner">
        <div class="drawer-header">
          <div class="drawer-brand">
            <el-icon :size="20" class="brand-icon"><MagicStick /></el-icon>
            <span class="drawer-brand-name">Deepseek Toolkit</span>
          </div>
          <el-button text class="drawer-close" aria-label="关闭菜单" @click="drawerVisible = false">
            <el-icon :size="18"><Close /></el-icon>
          </el-button>
        </div>

        <nav class="drawer-links">
          <a
            v-for="item in navItems"
            :key="item.path"
            class="drawer-link"
            :class="{ active: isActive(item.path) }"
            @click.prevent="navigate(item.path)"
          >
            {{ item.label }}
          </a>
        </nav>

        <div class="drawer-actions">
          <el-button plain @click="router.push('/login')">Login</el-button>
          <el-button type="primary" @click="router.push('/register')">Register</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.portal-navbar {
  width: 100%;
}
.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.brand-icon {
  color: var(--el-color-primary);
}
.brand-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.brand-task-notif {
  margin-left: 6px;
}

.navbar-links {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-link {
  padding: 7px 16px;
  border-radius: 16px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s;
}
.nav-link:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color);
}
.nav-link.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-weight: 600;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hamburger-btn {
  color: var(--el-text-color-primary);
}

/* 抽屉 */
:global(.portal-drawer) .el-drawer__body {
  padding: 0;
}
.drawer-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 18px 16px;
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.drawer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.drawer-brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.drawer-close {
  color: var(--el-text-color-secondary);
}

.drawer-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}
.drawer-link {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s;
}
.drawer-link:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.drawer-link.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.drawer-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}
.drawer-actions .el-button {
  width: 100%;
  margin-left: 0;
}

@media (max-width: 960px) {
  .navbar-inner {
    height: 54px;
    padding: 0 16px;
  }
}
</style>
