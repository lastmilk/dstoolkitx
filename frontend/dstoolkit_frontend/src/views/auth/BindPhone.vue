<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { success } from '@/utils/sweetalert'
import { showGeetest, GEETEST_CANCELLED } from '@/utils/geetest'

const auth = useAuthStore()
const router = useRouter()

const phone = ref('')
const code = ref('')
const sendLoading = ref(false)
const bindLoading = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const PHONE_RE = /^1[3-9]\d{9}$/
const alreadyBound = computed(() => !!auth.user?.phone)

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

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

async function onSendCode() {
  if (countdown.value > 0 || sendLoading.value) return
  if (!PHONE_RE.test(phone.value.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  sendLoading.value = true
  let captcha
  try {
    captcha = await showGeetest()
  } catch (e: any) {
    if (e?.code !== GEETEST_CANCELLED) ElMessage.error(e?.message || '人机验证失败')
    return
  } finally {
    sendLoading.value = false
  }
  try {
    await auth.phoneSendCode(phone.value.trim(), captcha)
    ElMessage.success('验证码已发送')
    startCountdown()
  } catch {
    /* 失败原因已由 request 响应拦截器统一提示 */
  }
}

async function onBind() {
  if (bindLoading.value) return
  if (!PHONE_RE.test(phone.value.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (!code.value.trim()) {
    ElMessage.warning('请输入验证码')
    return
  }
  bindLoading.value = true
  try {
    await auth.bindPhone(phone.value.trim(), code.value.trim())
    success('绑定成功', '手机号绑定成功，云端模式已解锁！')
    router.push('/profile')
  } catch {
    /* 失败原因已由 request 响应拦截器统一提示 */
  } finally {
    bindLoading.value = false
  }
}

function skip() {
  router.push('/git-repos')
}
</script>

<template>
  <div class="bind-page">
    <el-card class="bind-card" shadow="always">
      <div class="bind-icon">
        <el-icon :size="24"><Iphone /></el-icon>
      </div>
      <h2 class="bind-title">绑定手机号</h2>

      <template v-if="alreadyBound">
        <p class="bind-subtitle">当前账号已绑定手机号 {{ auth.user?.phone }}</p>
        <el-button type="primary" size="large" class="submit-btn" @click="skip">
          返回
        </el-button>
      </template>

      <template v-else>
        <p class="bind-subtitle">
          绑定手机号后即可使用云端同步与云端导入；
          <span v-if="auth.needsPhoneForCloud" class="bind-required">你的账号尚未绑定，云端功能暂不可用</span>
        </p>

        <el-form label-position="top" size="large" @keyup.enter="onBind">
          <el-form-item label="手机号">
            <el-input v-model="phone" placeholder="请输入手机号" maxlength="11" clearable>
              <template #prefix>
                <el-icon><Iphone /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="验证码">
            <div class="code-row">
              <el-input v-model="code" placeholder="请输入验证码" maxlength="6">
                <template #prefix>
                  <el-icon><Key /></el-icon>
                </template>
              </el-input>
              <el-button
                class="code-btn"
                :disabled="countdown > 0"
                :loading="sendLoading"
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
            :loading="bindLoading"
            @click="onBind"
          >
            绑定手机号
          </el-button>
          <el-button size="large" class="skip-btn" @click="skip">
            暂不绑定，仅本地使用
          </el-button>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.bind-page {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.bind-card {
  width: 100%;
  max-width: 400px;
  padding: 8px 12px;
}

.bind-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-border-color-light);
}

.bind-title {
  margin: 0 0 6px;
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.bind-subtitle {
  margin: 0 0 20px;
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.bind-required {
  color: var(--el-color-warning);
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

.skip-btn {
  width: 100%;
  margin: 10px 0 0;
  color: var(--el-text-color-regular);
  border-color: var(--el-border-color);
}
</style>
