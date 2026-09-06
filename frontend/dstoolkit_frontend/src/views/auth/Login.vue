<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { success } from '@/utils/sweetalert'
import { showGeetest, GEETEST_CANCELLED } from '@/utils/geetest'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const activeTab = ref('sms')
const agreed = ref(false)

function openLegal(path: string) {
  const { href } = router.resolve(path)
  window.open(href, '_blank', 'noopener,noreferrer')
}

// ── 验证码登录 ─────────────────────────────────────────────

const phone = ref('')
const smsCode = ref('')
const smsLoading = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const PHONE_RE = /^1[3-9]\d{9}$/

function startCountdown() {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function onSendCode() {
  if (countdown.value > 0) return
  if (!PHONE_RE.test(phone.value.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  let captcha
  try {
    captcha = await showGeetest()
  } catch (e: any) {
    if (e?.code !== GEETEST_CANCELLED) ElMessage.error(e?.message || '人机验证失败')
    return
  }
  try {
    await auth.smsSend(phone.value.trim(), captcha)
    ElMessage.success('验证码已发送')
    startCountdown()
  } catch {
    /* 失败原因已由 request 响应拦截器统一提示 */
  }
}

async function onSmsLogin() {
  if (smsLoading.value) return
  if (!agreed.value) {
    ElMessage.warning('请先阅读并同意《用户协议》和《隐私政策》')
    return
  }
  if (!PHONE_RE.test(phone.value.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (!smsCode.value.trim()) {
    ElMessage.warning('请输入验证码')
    return
  }
  smsLoading.value = true
  try {
    await auth.smsLogin(phone.value.trim(), smsCode.value.trim())
    success('登录成功', `欢迎回来，${auth.user?.username || '用户'}！`)
    router.push((route.query.redirect as string) || '/configs')
  } catch {
    /* 失败原因已由 request 响应拦截器统一提示 */
  } finally {
    smsLoading.value = false
  }
}

// ── 密码登录 ───────────────────────────────────────────────

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
  if (!agreed.value) {
    ElMessage.warning('请先阅读并同意《用户协议》和《隐私政策》')
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const captcha = await showGeetest()
    await auth.login(form.username.trim(), form.password, captcha)
    success('登录成功', `欢迎回来，${auth.user?.username || '用户'}！`)
    router.push((route.query.redirect as string) || '/configs')
  } catch (e: any) {
    if (e?.code !== GEETEST_CANCELLED && e?.message?.includes('人机验证')) {
      ElMessage.error(e.message)
    }
    /* 其余失败原因已由 request 响应拦截器统一提示 */
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

      <el-tabs v-model="activeTab" class="auth-tabs">
        <el-tab-pane label="验证码登录" name="sms">
          <el-form label-position="top" size="large" @keyup.enter="onSmsLogin">
            <el-form-item label="手机号">
              <el-input v-model="phone" placeholder="请输入手机号" maxlength="11" clearable>
                <template #prefix>
                  <el-icon><Iphone /></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="验证码">
              <div class="code-row">
                <el-input v-model="smsCode" placeholder="请输入验证码" maxlength="6">
                  <template #prefix>
                    <el-icon><Key /></el-icon>
                  </template>
                </el-input>
                <el-button
                  class="code-btn"
                  :disabled="countdown > 0"
                  @click="onSendCode"
                >
                  {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
                </el-button>
              </div>
            </el-form-item>

            <el-button
              type="primary"
              size="large"
              class="submit-btn"
              :loading="smsLoading"
              @click="onSmsLogin"
            >
              登录 / 注册
            </el-button>
            <p class="sms-tip">未注册的手机号将自动创建账号</p>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="密码登录" name="password">
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
        </el-tab-pane>
      </el-tabs>

      <div class="agreement-row">
        <el-checkbox v-model="agreed" size="small">
          我已阅读并同意
          <a class="legal-link" @click.prevent="openLegal('/portal/agreement')">《用户协议》</a>
          和
          <a class="legal-link" @click.prevent="openLegal('/portal/privacy')">《隐私政策》</a>
        </el-checkbox>
      </div>

      <el-divider>
        <span class="divider-text">还没有账号？</span>
      </el-divider>

      <el-button size="large" class="alt-btn" @click="router.push('/register')">
        创建新账号
        <el-icon class="btn-suffix"><ArrowRight /></el-icon>
      </el-button>
    </el-card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  min-height: 100dvh;
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
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.code-btn {
  flex-shrink: 0;
  min-width: 108px;
}

.submit-btn {
  width: 100%;
  margin-top: 4px;
}

.sms-tip {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agreement-row {
  margin: 16px 4px 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.legal-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}
.legal-link:hover {
  text-decoration: underline;
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
</style>
