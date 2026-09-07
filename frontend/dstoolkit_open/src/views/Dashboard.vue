<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Key, Lock, Share, Connection, Document, ArrowRight } from '@element-plus/icons-vue'
import { request } from '@/utils/request'

const router = useRouter()

const stats = ref({
  apiKeys: 0,
  apiTokens: 0,
  gitKeys: 0,
  oauthApps: 0,
})

const loading = ref(true)

async function loadStats() {
  loading.value = true
  try {
    const [keys, tokens, git, oauth] = await Promise.allSettled([
      request.get('/apikeys'),
      request.get('/tokens'),
      request.get('/gitkeys'),
      request.get('/oauth/clients'),
    ])
    if (keys.status === 'fulfilled') stats.value.apiKeys = (keys.value as any).apiKeys?.length ?? 0
    if (tokens.status === 'fulfilled') stats.value.apiTokens = (tokens.value as any).tokens?.length ?? 0
    if (git.status === 'fulfilled') stats.value.gitKeys = (git.value as any).keys?.length ?? 0
    if (oauth.status === 'fulfilled') stats.value.oauthApps = (oauth.value as any).clients?.length ?? 0
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)

const cards = [
  {
    title: 'API 密钥',
    desc: '存储 DeepSeek 等第三方 API 密钥',
    icon: Key,
    path: '/apikeys',
    statKey: 'apiKeys' as const,
    color: '#6366f1',
  },
  {
    title: 'API 访问令牌',
    desc: '生成 dstk_ 令牌访问 RESTful API',
    icon: Lock,
    path: '/tokens',
    statKey: 'apiTokens' as const,
    color: '#0ea5e9',
  },
  {
    title: 'Git 凭证',
    desc: '管理 Git 推送用户名与 APIKey',
    icon: Share,
    path: '/gitkeys',
    statKey: 'gitKeys' as const,
    color: '#f59e0b',
  },
  {
    title: 'OAuth 应用',
    desc: '创建 OAuth2 应用授权第三方',
    icon: Connection,
    path: '/oauth',
    statKey: 'oauthApps' as const,
    color: '#10b981',
  },
]
</script>

<template>
  <div v-loading="loading">
    <!-- 欢迎区 -->
    <el-card shadow="never" class="hero-card">
      <div class="hero-content">
        <div>
          <h2 class="hero-title">欢迎使用 DSToolKit 开放平台</h2>
          <p class="hero-desc">
            在这里统一管理你的 API 密钥、访问令牌、Git 凭证与 OAuth 应用。
            通过 RESTful API 或 Git 协议，以编程方式访问你的对话数据。
          </p>
          <div class="hero-actions">
            <el-button type="primary" @click="router.push('/docs')">
              <el-icon :size="14"><Document /></el-icon>
              查看 API 文档
              <el-icon :size="14"><ArrowRight /></el-icon>
            </el-button>
            <el-button plain @click="router.push('/tokens')">
              创建访问令牌
            </el-button>
          </div>
        </div>
        <div class="hero-badge">
          <el-icon :size="48" color="#4f46e5"><Connection /></el-icon>
        </div>
      </div>
    </el-card>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col v-for="card in cards" :key="card.path" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card" @click="router.push(card.path)">
          <div class="stat-icon" :style="{ background: card.color + '15', color: card.color }">
            <el-icon :size="22"><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-num">{{ stats[card.statKey] }}</div>
            <div class="stat-label">{{ card.title }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快速开始 -->
    <el-card shadow="never" class="quick-card">
      <template #header>
        <div class="card-header">
          <span>快速开始</span>
        </div>
      </template>
      <el-steps :active="0" align-center class="quick-steps">
        <el-step title="创建访问令牌" description="在「API 令牌」中生成 dstk_ 令牌" />
        <el-step title="阅读 API 文档" description="查看 /api/v1/* 端点与鉴权方式" />
        <el-step title="调用接口" description="使用 Bearer 令牌发起请求" />
        <el-step title="管理凭证" description="随时吊销或重新生成令牌" />
      </el-steps>
    </el-card>

    <!-- 安全提示 -->
    <el-alert
      type="info"
      show-icon
      :closable="false"
      class="security-alert"
      title="安全提示"
      description="所有密钥与令牌均加密存储或仅存哈希，明文仅在创建时返回一次。请妥善保存，怀疑泄露时立即吊销。"
    />
  </div>
</template>

<style scoped>
.hero-card {
  margin-bottom: 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
}
.hero-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.hero-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
}
.hero-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  max-width: 560px;
}
.hero-actions {
  display: flex;
  gap: 10px;
}
.hero-badge {
  flex-shrink: 0;
  opacity: 0.6;
}

.stats-row {
  margin-bottom: 20px;
}
.stat-card {
  cursor: pointer;
  border-radius: 10px;
  transition: transform 0.2s;
}
.stat-card:hover {
  transform: translateY(-2px);
}
.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 14px;
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-info {
  min-width: 0;
}
.stat-num {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
}
.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.quick-card {
  margin-bottom: 20px;
  border-radius: 10px;
}
.card-header {
  font-weight: 600;
}
.quick-steps {
  padding: 12px 0;
}

.security-alert {
  border-radius: 10px;
}

@media (max-width: 768px) {
  .hero-badge {
    display: none;
  }
  .stats-row {
    margin-bottom: 0;
  }
  .stats-row :deep(.el-col) {
    margin-bottom: 12px;
  }
}
</style>
