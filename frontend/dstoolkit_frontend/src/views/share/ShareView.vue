<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Loading } from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import ChatViewer from '@/components/ChatViewer.vue'
import type { ParsedConversation } from '@/types'

interface ShareResponse {
  share: {
    theme?: string
    title?: string
    viewCount?: number
  }
  conversation: ParsedConversation
}

const route = useRoute()
const slug = computed<string>(() => String(route.params.slug || ''))

const loading = ref<boolean>(true)
const error = ref<string>('')
const requiresPassword = ref<boolean>(false)
const password = ref<string>('')
const title = ref<string>('')
const viewCount = ref<number>(0)
const conversation = ref<ParsedConversation | null>(null)

/** 加载分享数据：GET /api/public/shares/:slug（可选 X-Share-Password 头） */
async function fetchShare(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = (await request.get(`/public/shares/${slug.value}`, {
      headers: password.value ? { 'X-Share-Password': password.value } : undefined,
    })) as unknown as ShareResponse
    title.value = res.share.title || ''
    viewCount.value = res.share.viewCount || 0
    conversation.value = res.conversation
    requiresPassword.value = false
  } catch (e: unknown) {
    const err = e as {
      response?: { status?: number; data?: { requiresPassword?: boolean; error?: string } }
    }
    const status: number | undefined = err?.response?.status
    if (status === 401 && err?.response?.data?.requiresPassword) {
      requiresPassword.value = true
    } else {
      error.value = err?.response?.data?.error || '加载失败'
    }
  } finally {
    loading.value = false
  }
}

function submitPassword(): void {
  if (!password.value) return
  fetchShare()
}

onMounted(fetchShare)
</script>

<template>
  <div class="share-root">
    <header class="share-header">
      <div class="share-brand">
        <span class="logo">Deepseek</span>
        <span class="sub">dstoolkit · 分享</span>
      </div>
      <span class="share-count">浏览 {{ viewCount }} 次</span>
    </header>

    <main class="share-main">
      <!-- 加载中 -->
      <div v-if="loading" class="share-loading">
        <el-icon class="is-loading" :size="40" color="var(--el-color-primary)">
          <Loading />
        </el-icon>
        <span class="share-loading-text">正在加载分享…</span>
      </div>

      <!-- 需要密码 -->
      <el-card v-else-if="requiresPassword" class="share-card share-pw">
        <h3 class="share-pw-title">此分享需要密码</h3>
        <p class="share-pw-sub">请输入分享者设置的访问密码</p>
        <div class="share-pw-form">
          <el-input
            v-model="password"
            type="password"
            show-password
            placeholder="访问密码"
            style="width: 240px"
            @keyup.enter="submitPassword"
          />
          <el-button type="primary" @click="submitPassword">验证</el-button>
        </div>
      </el-card>

      <!-- 错误 -->
      <el-empty v-else-if="error" :description="error" class="share-error" />

      <!-- 分享内容（只读：api-keys 传空数组，ChatViewer 隐藏输入区） -->
      <template v-else-if="conversation">
        <el-card class="share-card share-title">
          <h2 class="share-title-text">{{ title }}</h2>
          <span class="share-title-sub">
            {{ conversation.messages.length }} 条消息 ·
            {{ conversation.turns?.length ?? conversation.turnCount ?? 0 }} 轮对话
          </span>
        </el-card>
        <el-card class="share-card share-conv">
          <ChatViewer :conversation="conversation" :api-keys="[]" />
        </el-card>
      </template>
    </main>

    <footer class="share-footer">
      <span>由 dstoolkit 生成</span>
    </footer>
  </div>
</template>

<style scoped>
.share-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}
.share-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.share-brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.share-brand .logo {
  font-weight: 700;
  color: var(--el-color-primary);
  font-size: 16px;
}
.share-brand .sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.share-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.share-main {
  flex: 1;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.share-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
}
.share-loading-text {
  margin-top: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.share-card {
  border-radius: 10px;
}
.share-pw {
  max-width: 360px;
  margin: 60px auto;
  width: 100%;
  text-align: center;
}
.share-pw-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--el-text-color-primary);
}
.share-pw-sub {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.share-pw-form {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.share-error {
  padding: 80px 0;
}
.share-title {
  flex-shrink: 0;
}
.share-title-text {
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--el-text-color-primary);
}
.share-title-sub {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.share-conv {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.share-conv :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 60vh;
}
.share-footer {
  text-align: center;
  padding: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
</style>
