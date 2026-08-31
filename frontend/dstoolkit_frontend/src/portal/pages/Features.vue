<script setup lang="ts">
/**
 * Features.vue（Element Plus 版功能页）
 *  - 标题 + 副标题 + 8 张功能卡片（el-card，纯色图标块）
 */
import type { Component } from 'vue'
import {
  Search, DataAnalysis, MagicStick, Upload, Lock, Sunny, Promotion, Grid,
} from '@element-plus/icons-vue'

interface FeatureBlock {
  icon: Component
  title: string
  description: string
  accent: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

const features: FeatureBlock[] = [
  {
    icon: Search,
    title: '全文检索',
    description: '基于 FlexSearch 的高性能全文检索引擎，支持正则、关键词、多条件组合筛选，数秒内从海量对话中精准定位目标内容。',
    accent: 'primary',
  },
  {
    icon: DataAnalysis,
    title: '对话可视化',
    description: '基于 ECharts 的数据统计面板，覆盖对话量、模型分布、活跃时段、Token 消耗等多维度指标，一眼洞察使用趋势。',
    accent: 'success',
  },
  {
    icon: MagicStick,
    title: '多模型集成',
    description: '无缝接入主流大语言模型，在统一聊天界面中自由切换，保持对话语境连贯，支持一键续写历史对话。',
    accent: 'warning',
  },
  {
    icon: Upload,
    title: 'Alpaca 格式导出',
    description: '一键将精选对话转换为标准 Alpaca JSON 训练集，自动处理数据清洗与格式校验，直接用于模型微调。',
    accent: 'info',
  },
  {
    icon: Lock,
    title: 'OAuth 授权',
    description: '支持标准 OAuth2.0 授权流程，第三方应用可通过授权码模式安全访问你的对话数据，权限可控、审计可查。',
    accent: 'danger',
  },
  {
    icon: Sunny,
    title: '自定义主题 / 背景',
    description: '内置多套精美主题（Light / Dark / Ocean / Forest / Mono），支持 ACG / Bing / 自定义图片背景，打造个性化工作台。',
    accent: 'primary',
  },
  {
    icon: Promotion,
    title: '邀请返利',
    description: '生成专属邀请链接，好友注册后双方都能获得奖励积分，积分可用于升级套餐或兑换模型调用额度。',
    accent: 'success',
  },
  {
    icon: Grid,
    title: '模型市场',
    description: '丰富的模型与能力扩展资源市场，官方精选 + 社区贡献，一站获取最新模型、插件与提示词模板。',
    accent: 'warning',
  },
]
</script>

<template>
  <div class="portal-features">
    <section class="features-hero">
      <div class="features-hero-inner">
        <h1 class="features-title">强大功能，<span class="title-accent">尽在掌握</span></h1>
        <p class="features-subtitle">
          从数据管理到可视化分析，从模型切换到训练集导出，八大核心能力让你的 AI
          对话资产真正可管理、可复用、可增值。
        </p>
      </div>
    </section>

    <section class="features-grid-section">
      <div class="features-grid-inner">
        <div class="features-grid">
          <el-card
            v-for="feat in features"
            :key="feat.title"
            shadow="hover"
            class="feature-card"
          >
            <div class="feat-icon" :class="`accent-${feat.accent}`">
              <el-icon :size="22"><component :is="feat.icon" /></el-icon>
            </div>
            <h3 class="feat-title">{{ feat.title }}</h3>
            <p class="feat-desc">{{ feat.description }}</p>
          </el-card>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.features-hero {
  padding: 68px 24px 44px;
  display: flex;
  justify-content: center;
}
.features-hero-inner {
  max-width: 760px;
  text-align: center;
}
.features-title {
  font-size: 40px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
  margin: 0 0 18px;
  letter-spacing: -0.02em;
}
.title-accent {
  color: var(--el-color-primary);
}
.features-subtitle {
  font-size: 15.5px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0;
}

.features-grid-section {
  padding: 8px 24px 76px;
  display: flex;
  justify-content: center;
}
.features-grid-inner {
  max-width: 1200px;
  width: 100%;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.feature-card :deep(.el-card__body) {
  padding: 24px 22px;
}
.feat-icon {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.accent-primary {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.accent-success {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.accent-warning {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}
.accent-danger {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
.accent-info {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
}
.feat-title {
  font-size: 16.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 10px;
  line-height: 1.3;
}
.feat-desc {
  font-size: 13.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.65;
  margin: 0;
}

@media (max-width: 960px) {
  .features-hero {
    padding: 48px 18px 28px;
  }
  .features-title {
    font-size: 30px;
  }
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .features-grid-section {
    padding: 4px 18px 56px;
  }
}
@media (max-width: 560px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
  .features-title {
    font-size: 25px;
  }
}
</style>
