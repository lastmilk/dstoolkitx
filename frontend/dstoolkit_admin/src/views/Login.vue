<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const loading = ref(false)

async function onSubmit() {
  if (!username.value || !password.value) return
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (e: any) {
    ElMessage.error(e?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #304156;">
    <el-card style="width: 380px;">
      <h2 style="margin: 0 0 8px; color: #409eff;">dstoolkit 后台</h2>
      <p style="margin: 0 0 16px; color: #999; font-size: 13px;">仅管理员可登录</p>
      <el-form @keyup.enter="onSubmit">
        <el-form-item label="用户名"><el-input v-model="username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="password" type="password" show-password /></el-form-item>
        <el-button type="primary" :loading="loading" @click="onSubmit" style="width: 100%;">登录</el-button>
      </el-form>
    </el-card>
  </div>
</template>
