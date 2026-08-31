<script setup lang="ts">
/**
 * MainLayout.vue（Element Plus 版）
 *  - el-container 布局：el-aside 侧边栏（el-menu router 模式）+ el-header 顶栏 + el-main 内容区
 *  - 顶栏：品牌 logo、页面标题、主题切换（toggleDark）、用户下拉（个人中心 / 退出登录）
 *  - 侧栏底部：云端同步开关 + 用户卡片
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Upload, Search, DataAnalysis, Switch as SwitchIcon, Wallet, Medal, Grid, User,
  Sunny, Moon, SwitchButton, Cloudy, CircleClose,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { clearLocalData } from '@/utils/db'
import { confirmDanger } from '@/utils/sweetalert'
import logo from '@/assets/logo.png'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()

// ═══════════ 响应式：窄屏时侧栏折叠为图标模式 ═══════════
const isMobile = ref(false)
function checkViewport() {
  isMobile.value = window.innerWidth < 768
}
onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})

// 路由切换后无需额外处理（el-menu router 模式自动高亮）

// ═══════════ 侧边导航（与旧版一致的 8 个入口） ═══════════
interface MenuItem {
  label: string
  path: string
  icon: Component
}
const menuItems: MenuItem[] = [
  { label: '账号配置', path: '/configs', icon: Upload },
  { label: '对话探索', path: '/explore', icon: Search },
  { label: '数据统计', path: '/stats', icon: DataAnalysis },
  { label: 'Alpaca 导出', path: '/alpaca', icon: SwitchIcon },
  { label: '余额', path: '/balance', icon: Wallet },
  { label: '升级方案', path: '/pricing', icon: Medal },
  { label: '模型市场', path: '/market', icon: Grid },
  { label: '个人中心', path: '/profile', icon: User },
]
const activePath = computed(() => route.path)

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  configs: { title: '账号配置', subtitle: '上传与管理你的 Deepseek 数据' },
  explore: { title: '对话探索', subtitle: '搜索、浏览和继续你的对话' },
  stats: { title: '数据统计', subtitle: '对话量、模型分布、活跃时段' },
  alpaca: { title: 'Alpaca 导出', subtitle: '导出为微调训练数据格式' },
  balance: { title: '余额', subtitle: 'API Key 余额与用量信息' },
  pricing: { title: '升级方案', subtitle: 'Pro / Plus / Ultimate 三档权益与支付' },
  market: { title: '模型市场', subtitle: '工具生态与官方资源' },
  profile: { title: '个人中心', subtitle: '账号设置、密钥管理' },
}
const pageMeta = computed(() => PAGE_META[(route.name as string) ?? ''] ?? { title: '', subtitle: '' })

// ═══════════ 云端同步（沿用旧版行为） ═══════════
async function onCloudSync(value: string | number | boolean) {
  const enabled = value === true
  try {
    await auth.setCloudSync(enabled)
    if (!enabled) {
      await clearLocalData()
      ElMessage.success('已切换为仅本地存储，本地索引已清空')
    } else {
      ElMessage.success('已开启云端存储，上传的对话将同步到云端')
    }
  } catch {
    /* 错误已由拦截器提示 */
  }
}

// ═══════════ 用户下拉菜单 ═══════════
async function handleLogout() {
  const ok = await confirmDanger('确认退出登录？', '退出后需要重新登录才能访问工作台。')
  if (!ok) return
  auth.logout()
  router.push({ name: 'login' })
  ElMessage.success('已退出登录')
}
function handleUserCommand(cmd: string | number | object) {
  if (cmd === 'logout') handleLogout()
  else if (cmd === 'profile') router.push({ name: 'profile' })
}
</script>

<template>
  <el-container class="main-layout">
    <!-- ══════════ 侧边栏 ══════════ -->
    <el-aside :width="isMobile ? '64px' : '220px'" class="layout-aside">
      <el-menu
        :default-active="activePath"
        class="side-menu"
        router
        :collapse="isMobile"
        :collapse-transition="false"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <!-- 侧栏底部：云端同步 + 用户卡片 -->
      <div v-if="!isMobile" class="aside-footer">
        <div class="cloud-row">
          <el-icon :size="16" class="cloud-icon">
            <Cloudy v-if="auth.cloudSyncEnabled" />
            <CircleClose v-else />
          </el-icon>
          <span class="cloud-label">{{ auth.cloudSyncEnabled ? '云端同步' : '离线模式' }}</span>
          <el-switch
            :model-value="auth.cloudSyncEnabled"
            size="small"
            @update:model-value="onCloudSync"
          />
        </div>
        <div class="aside-user" @click="router.push('/profile')">
          <el-avatar :size="32" class="aside-avatar">
            {{ (auth.user?.username || 'U').charAt(0).toUpperCase() }}
          </el-avatar>
          <div class="aside-user-info">
            <div class="aside-user-name">{{ auth.user?.username || '用户' }}</div>
            <div class="aside-user-role">{{ auth.isAdmin ? '管理员' : '用户' }}</div>
          </div>
        </div>
      </div>
    </el-aside>

    <el-container class="layout-main-container">
      <!-- ══════════ 顶栏 ══════════ -->
      <el-header class="layout-topbar" height="60px">
        <div class="topbar-left">
          <img :src="logo" alt="Logo" class="topbar-logo">
          <div class="topbar-brand">
            <span class="brand-name">Deepseek Toolkit</span>
            <span class="brand-tag">对话管理工作台</span>
          </div>
          <el-divider direction="vertical" />
          <div class="page-identity">
            <span class="page-title">{{ pageMeta.title }}</span>
            <span class="page-subtitle">{{ pageMeta.subtitle }}</span>
          </div>
        </div>

        <div class="topbar-right">
          <!-- 主题切换 -->
          <el-button
            text
            circle
            class="theme-btn"
            :title="themeStore.isDark ? '切换为亮色' : '切换为暗色'"
            @click="themeStore.toggleDark()"
          >
            <el-icon :size="18">
              <Sunny v-if="themeStore.isDark" />
              <Moon v-else />
            </el-icon>
          </el-button>

          <!-- 用户下拉 -->
          <el-dropdown trigger="click" placement="bottom-end" @command="handleUserCommand">
            <div class="user-trigger">
              <el-avatar :size="30" class="user-avatar">
                {{ (auth.user?.username || 'U').charAt(0).toUpperCase() }}
              </el-avatar>
              <span class="user-name">{{ auth.user?.username || '用户' }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided class="logout-item">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- ══════════ 内容区 ══════════ -->
      <el-main class="layout-main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
/* ══════════ 布局骨架 ══════════ */
.main-layout {
  height: 100vh;
  width: 100%;
  overflow: hidden;
}
.layout-main-container {
  min-width: 0;
  overflow: hidden;
}

/* ══════════ 侧边栏 ══════════ */
.layout-aside {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  overflow: hidden;
}
.side-menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none;
  padding: 8px;
}
.side-menu:not(.el-menu--collapse) {
  width: 100%;
}
.side-menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  border-radius: 8px;
  margin: 2px 0;
}
.side-menu :deep(.el-menu-item:hover) {
  background: var(--el-fill-color);
}
.side-menu :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

/* 侧栏底部 */
.aside-footer {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--el-border-color-light);
}
.cloud-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.cloud-icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.cloud-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aside-user {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  background: var(--el-fill-color-light);
  transition: background-color 0.2s;
}
.aside-user:hover {
  background: var(--el-color-primary-light-9);
}
.aside-avatar {
  flex-shrink: 0;
  background: var(--el-color-primary);
  color: #fff;
  font-weight: 600;
}
.aside-user-info {
  min-width: 0;
  line-height: 1.3;
}
.aside-user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aside-user-role {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

/* ══════════ 顶栏 ══════════ */
.layout-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.topbar-logo {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
}
.topbar-brand {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.01em;
}
.brand-tag {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.page-identity {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.page-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}
.page-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.theme-btn {
  color: var(--el-text-color-regular);
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s;
}
.user-trigger:hover {
  background: var(--el-fill-color);
}
.user-avatar {
  flex-shrink: 0;
  background: var(--el-color-primary);
  color: #fff;
  font-weight: 600;
  font-size: 13px;
}
.user-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.logout-item {
  color: var(--el-color-danger);
}

/* ══════════ 内容区 ══════════ */
.layout-main {
  padding: 20px;
  overflow-y: auto;
  background: var(--el-bg-color-page);
}

/* ══════════ 窄屏微调 ══════════ */
@media (max-width: 768px) {
  .brand-tag,
  .page-subtitle {
    display: none;
  }
  .user-name {
    display: none;
  }
  .layout-topbar {
    padding: 0 12px;
  }
}
</style>
