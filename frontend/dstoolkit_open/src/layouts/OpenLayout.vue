<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Odometer, Key, Lock, Share, Connection, Document,
  Sunny, Moon, SwitchButton, User, Menu, Back,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()

const isMobile = ref(false)
const mobileSidebarVisible = ref(false)

function checkViewport() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) mobileSidebarVisible.value = false
}
onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})

function navigateMenu(path: string) {
  router.push(path)
  mobileSidebarVisible.value = false
}

function handleLogout() {
  auth.logout()
  router.push({ name: 'login' })
}

interface MenuItem {
  label: string
  path: string
  icon: Component
  group: string
}

const menuItems: MenuItem[] = [
  { label: '概览', path: '/', icon: Odometer, group: '总览' },
  { label: 'API 密钥', path: '/apikeys', icon: Key, group: '凭证管理' },
  { label: 'API 令牌', path: '/tokens', icon: Lock, group: '凭证管理' },
  { label: 'Git 凭证', path: '/gitkeys', icon: Share, group: '凭证管理' },
  { label: 'OAuth 应用', path: '/oauth', icon: Connection, group: '凭证管理' },
  { label: 'API 文档', path: '/docs', icon: Document, group: '开发资源' },
]

const menuGroups = computed(() => {
  const map = new Map<string, MenuItem[]>()
  for (const item of menuItems) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map.entries())
})

const activePath = computed(() => route.path)

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: '开放平台概览', subtitle: '管理你的 API 密钥、访问令牌与 Git 凭证' },
  apikeys: { title: 'API 密钥', subtitle: '存储 DeepSeek 等第三方 API 密钥，加密保存' },
  tokens: { title: 'API 访问令牌', subtitle: '生成 dstk_ 令牌，通过 RESTful API 访问数据' },
  gitkeys: { title: 'Git 凭证', subtitle: '管理 Git 推送用户名与 Git APIKey' },
  oauth: { title: 'OAuth 应用', subtitle: '创建 OAuth2 应用，授权第三方访问你的数据' },
  docs: { title: 'API 文档', subtitle: 'RESTful API 端点参考与快速开始' },
}
const pageMeta = computed(() => PAGE_META[(route.name as string) ?? ''] ?? { title: '', subtitle: '' })
</script>

<template>
  <el-container class="open-layout">
    <!-- 桌面端侧边栏 -->
    <el-aside v-if="!isMobile" width="240px" class="open-aside">
      <div class="brand">
        <div class="brand-icon">
          <el-icon :size="20"><Odometer /></el-icon>
        </div>
        <div class="brand-text">
          <div class="brand-name">DSToolKit</div>
          <div class="brand-tag">开放平台</div>
        </div>
      </div>

      <el-menu
        :default-active="activePath"
        class="side-menu"
        router
      >
        <template v-for="[group, items] in menuGroups" :key="group">
          <div class="menu-group-title">{{ group }}</div>
          <el-menu-item v-for="item in items" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.label }}</template>
          </el-menu-item>
        </template>
      </el-menu>

      <div class="aside-footer">
        <div class="aside-user" @click="router.push('/')">
          <el-avatar :size="32" class="aside-avatar">
            {{ (auth.user?.username || 'U').charAt(0).toUpperCase() }}
          </el-avatar>
          <div class="aside-user-info">
            <div class="aside-user-name">{{ auth.user?.username || '用户' }}</div>
            <div class="aside-user-role">{{ auth.isAdmin ? '管理员' : '开发者' }}</div>
          </div>
        </div>
        <el-button text size="small" class="back-btn" @click="router.push('/configs')">
          <el-icon :size="14"><Back /></el-icon>
          返回工作台
        </el-button>
      </div>
    </el-aside>

    <!-- 移动端抽屉 -->
    <el-drawer
      v-if="isMobile"
      v-model="mobileSidebarVisible"
      :with-header="false"
      direction="ltr"
      size="260px"
    >
      <div class="mobile-drawer-inner">
        <div class="brand">
          <div class="brand-icon">
            <el-icon :size="20"><Odometer /></el-icon>
          </div>
          <div class="brand-text">
            <div class="brand-name">DSToolKit</div>
            <div class="brand-tag">开放平台</div>
          </div>
        </div>
        <el-menu
          :default-active="activePath"
          class="side-menu"
          @select="navigateMenu"
        >
          <template v-for="[group, items] in menuGroups" :key="group">
            <div class="menu-group-title">{{ group }}</div>
            <el-menu-item v-for="item in items" :key="item.path" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <template #title>{{ item.label }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </div>
    </el-drawer>

    <el-container class="open-main-container">
      <el-header class="open-topbar" height="60px">
        <div class="topbar-left">
          <el-button
            v-if="isMobile"
            text
            circle
            @click="mobileSidebarVisible = true"
          >
            <el-icon :size="20"><Menu /></el-icon>
          </el-button>
          <div class="page-identity">
            <span class="page-title">{{ pageMeta.title }}</span>
            <span class="page-subtitle">{{ pageMeta.subtitle }}</span>
          </div>
        </div>

        <div class="topbar-right">
          <el-button
            text
            circle
            :title="themeStore.isDark ? '切换亮色' : '切换暗色'"
            @click="themeStore.toggleDark()"
          >
            <el-icon :size="18">
              <Sunny v-if="themeStore.isDark" />
              <Moon v-else />
            </el-icon>
          </el-button>
          <el-dropdown trigger="click" placement="bottom-end" @command="(c: string) => c === 'logout' && handleLogout()">
            <div class="user-trigger">
              <el-avatar :size="30" class="user-avatar">
                {{ (auth.user?.username || 'U').charAt(0).toUpperCase() }}
              </el-avatar>
              <span class="user-name">{{ auth.user?.username || '用户' }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="open-main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.open-layout {
  height: 100vh;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
}
.open-main-container {
  min-width: 0;
  overflow: hidden;
}

.open-aside {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  overflow: hidden;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}
.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-text {
  line-height: 1.25;
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.brand-tag {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.side-menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-right: none;
  padding: 8px;
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

.menu-group-title {
  padding: 14px 12px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.05em;
}

.aside-footer {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--el-border-color-light);
}
.aside-user {
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
.back-btn {
  width: 100%;
  margin-top: 10px;
  color: var(--el-text-color-secondary);
}

/* 顶栏 */
.open-topbar {
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
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
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
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.open-main {
  padding: 20px;
  overflow-y: auto;
  background: var(--el-bg-color-page);
}

.mobile-drawer-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}

@media (max-width: 768px) {
  .page-subtitle {
    display: none;
  }
  .user-name {
    display: none;
  }
  .open-main {
    padding: 12px;
  }
}
</style>
