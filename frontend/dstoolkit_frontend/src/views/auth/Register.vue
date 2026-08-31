<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { success } from '@/utils/sweetalert'

const auth = useAuthStore()
const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 32, message: '用户名长度为 2 到 32 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少需要 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit() {
  if (loading.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await auth.register(form.username.trim(), form.password)
    success('注册成功', '欢迎加入，已自动为你登录！')
    router.push('/configs')
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

      <h2 class="auth-title">创建账号</h2>
      <p class="auth-subtitle">几秒即可完成注册，立即开始使用</p>

      <el-alert
        class="admin-tip"
        type="info"
        :closable="false"
        show-icon
        title="首个注册的用户将自动获得系统管理员权限"
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @keyup.enter="onSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="至少 2 个字符"
            clearable
            maxlength="32"
            show-word-limit
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="登录密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="至少 6 位，建议包含字母与数字"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            placeholder="请再次输入密码"
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
          创建账号并登录
        </el-button>
      </el-form>

      <el-divider>
        <span class="divider-text">已有账号？</span>
      </el-divider>

      <el-button size="large" class="alt-btn" @click="router.push('/login')">
        返回登录
        <el-icon class="btn-suffix"><ArrowRight /></el-icon>
      </el-button>

      <p class="foot-tip">注册即表示同意服务条款，你的对话数据不会被上传给任何第三方</p>
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
  max-width: 420px;
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
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.admin-tip {
  margin-bottom: 16px;
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

.foot-tip {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
