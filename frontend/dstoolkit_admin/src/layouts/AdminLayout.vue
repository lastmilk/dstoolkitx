<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => '/' + (route.path.split('/')[1] || 'dashboard'))

function onSelect(index: string) {
  router.push(index)
}

function handleCommand(cmd: string) {
  if (cmd === 'logout') {
    auth.logout()
    ElMessage.success('已退出')
    router.push('/login')
  }
}
</script>

<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="background: #304156">
      <div style="height: 60px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">
        dstoolkit 后台
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        @select="onSelect"
      >
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon><span>仪表盘</span></el-menu-item>
        <el-menu-item index="/users"><el-icon><User /></el-icon><span>用户管理</span></el-menu-item>
        <el-menu-item index="/configs"><el-icon><Files /></el-icon><span>配置/会话</span></el-menu-item>
        <el-menu-item index="/apikeys"><el-icon><Key /></el-icon><span>API Key</span></el-menu-item>
        <el-menu-item index="/market"><el-icon><Goods /></el-icon><span>应用市场</span></el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="display: flex; align-items: center; justify-content: flex-end; background: #fff; border-bottom: 1px solid #e6e6e6;">
        <el-dropdown @command="handleCommand">
          <span style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <el-avatar size="small" style="background: #409eff;">{{ (auth.user?.username || 'A').charAt(0).toUpperCase() }}</el-avatar>
            <span>{{ auth.user?.username }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main style="background: #f0f2f5;">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
