<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { success } from '@/utils/sweetalert'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function onSubmit() {
  if (loading.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    success('登录成功', `欢迎回来，${auth.user?.username || '用户'}！`)
    router.push((route.query.redirect as string) || '/configs')
  } catch {
    /* 失败原因已由 request 响应拦截器统一提示 */
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="always">
      <div class="brand">
        <div class="brand-icon">
          <el-icon :size="20"><MagicStick /></el-icon>
        </div>
        <span class="brand-name">DSToolKit</span>
      </div>

      <h2 class="auth-title">登录账号</h2>
      <p class="auth-subtitle">继续管理你的对话数据与数据集</p>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @keyup.enter="onSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" clearable>
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="submit-btn"
          :loading="loading"
          @click="onSubmit"
        >
          登录
        </el-button>
      </el-form>

      <el-divider>
        <span class="divider-text">还没有账号？</span>
      </el-divider>

      <el-button size="large" class="alt-btn" @click="router.push('/register')">
        创建新账号
        <el-icon class="btn-suffix"><ArrowRight /></el-icon>
      </el-button>

      <el-alert
        class="auth-tip"
        type="info"
        :closable="false"
        show-icon
        title="首个注册的用户将自动成为系统管理员"
      />
    </el-card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--el-bg-color-page);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 8px 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--el-border-radius-base);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-border-color-light);
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.auth-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.auth-subtitle {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.submit-btn {
  width: 100%;
  margin-top: 4px;
}

.divider-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.alt-btn {
  width: 100%;
  color: var(--el-text-color-regular);
  border-color: var(--el-border-color);
}

.btn-suffix {
  margin-left: 6px;
}

.auth-tip {
  margin-top: 16px;
}

.auth-tip :deep(.el-alert__description) {
  font-size: 12px;
}
</style>
