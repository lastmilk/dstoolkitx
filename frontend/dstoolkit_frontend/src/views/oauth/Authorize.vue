<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '@/utils/request'
import { useAuthStore } from '@/stores/auth'

interface OAuthQuery {
  client_id?: string
  redirect_uri?: string
  scope?: string
  state?: string
  code_challenge?: string
  code_challenge_method?: string
  [key: string]: string | undefined
}

interface AuthorizeResponse {
  redirectUrl: string
  [key: string]: unknown
}

const route = useRoute()
const auth = useAuthStore()

const loading = ref(false)
const errorMsg = ref('')

const q = computed<OAuthQuery>(() => route.query as unknown as OAuthQuery)

const SCOPE_LABELS: Record<string, string> = {
  'read:conversations': '读取你的对话列表与消息内容',
  'write:sync': '提交对话同步数据',
  search: '使用全文搜索',
  profile: '读取你的账号基本信息',
  offline_access: '离线访问（签发刷新令牌）',
}

const scopeList = computed<string[]>(() =>
  String(q.value.scope || '')
    .split(' ')
    .filter(Boolean),
)

const clientLabel = computed<string>(() => {
  if (q.value.client_id === 'dstk-mobile-app') return 'DsToolKit 移动应用'
  if (q.value.client_id === 'dstk-browser-ext') return 'DsToolKit 浏览器插件'
  return q.value.client_id || '未知应用'
})

onMounted(() => {
  if (!q.value.client_id || !q.value.redirect_uri || !q.value.code_challenge) {
    errorMsg.value = '缺少必要的授权参数（client_id / redirect_uri / code_challenge）'
    return
  }
  if (!auth.isLoggedIn) {
    const current: string = location.pathname + location.search
    location.href = `/login?redirect=${encodeURIComponent(current)}`
  }
})

async function onApprove(): Promise<void> {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = (await request.post('/oauth/authorize', {
      clientId: q.value.client_id,
      redirectUri: q.value.redirect_uri,
      scope: q.value.scope || '',
      state: q.value.state || '',
      codeChallenge: q.value.code_challenge,
      codeChallengeMethod: q.value.code_challenge_method || 'S256',
    })) as AuthorizeResponse
    location.href = res.redirectUrl
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    errorMsg.value = err?.response?.data?.error || '授权失败，请重试'
    loading.value = false
  }
}

function onDeny(): void {
  const url: URL = new URL(q.value.redirect_uri || 'dstoolkit://oauth-callback')
  url.searchParams.set('error', 'access_denied')
  if (q.value.state) url.searchParams.set('state', q.value.state)
  location.href = url.toString()
}
</script>

<template>
  <div class="oauth-page">
    <el-card class="oauth-card" shadow="always">
      <div class="oauth-icon">
        <el-icon :size="28"><Key /></el-icon>
      </div>

      <h2 class="oauth-title">授权请求</h2>
      <p class="oauth-desc">
        <strong>{{ clientLabel }}</strong> 请求访问你的 DsToolKit 账号
      </p>

      <div class="oauth-scopes">
        <div v-if="scopeList.length === 0" class="scope-item">
          <span class="scope-icon"><el-icon :size="14"><Lock /></el-icon></span>
          基础账号信息
        </div>
        <div v-for="s in scopeList" :key="s" class="scope-item">
          <span class="scope-icon"><el-icon :size="14"><Lock /></el-icon></span>
          {{ SCOPE_LABELS[s] || s }}
        </div>
      </div>

      <el-alert
        v-if="errorMsg"
        class="oauth-error"
        type="error"
        :closable="false"
        show-icon
        :title="errorMsg"
      />

      <div class="oauth-actions">
        <el-button size="large" plain :disabled="loading" @click="onDeny">
          <el-icon class="btn-suffix"><Close /></el-icon>
          拒绝
        </el-button>
        <el-button
          size="large"
          type="primary"
          :loading="loading"
          :disabled="!!errorMsg"
          @click="onApprove"
        >
          同意授权
        </el-button>
      </div>

      <p class="oauth-hint">授权后将返回 DsToolKit 应用，你随时可在应用内退出登录以撤销访问。</p>
    </el-card>
  </div>
</template>

<style scoped>
.oauth-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--el-bg-color-page);
}

.oauth-card {
  width: 100%;
  max-width: 420px;
  padding: 8px 12px;
  text-align: center;
}

.oauth-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-border-color-light);
}

.oauth-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.oauth-desc {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.oauth-desc strong {
  color: var(--el-text-color-primary);
}

.oauth-scopes {
  text-align: left;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 10px 14px;
  margin-bottom: 20px;
}

.scope-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.scope-icon {
  display: inline-flex;
  color: var(--el-color-primary);
}

.oauth-error {
  text-align: left;
  margin-bottom: 16px;
}

.oauth-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-suffix {
  margin-right: 6px;
}

.oauth-hint {
  margin: 20px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
