<script setup lang="ts">
/**
 * Home.vue（Element Plus 版门户首页）
 *  - Hero：标签 + 标题 + 副标题 + CTA（注册 / 功能页）
 *  - 四张功能亮点卡片（el-card）
 *  - 底部注册引导横幅（纯色）
 */
import { useRouter } from 'vue-router'
import type { Component } from 'vue'
import { Search, PieChart, MagicStick, Upload, ArrowRight, Promotion } from '@element-plus/icons-vue'

const router = useRouter()

interface HighlightCard {
  icon: Component
  title: string
  desc: string
  accent: 'primary' | 'success' | 'warning' | 'info'
}

const highlights: HighlightCard[] = [
  {
    icon: Search,
    title: '全文检索',
    desc: '支持正则、关键词、多条件筛选，数秒内定位历史对话，灵活的过滤器让查找更精准。',
    accent: 'primary',
  },
  {
    icon: PieChart,
    title: '数据可视化',
    desc: '基于 ECharts 的对话量、模型分布、活跃时段统计，一图掌握使用趋势与洞察。',
    accent: 'success',
  },
  {
    icon: MagicStick,
    title: '模型切换 / 聊天',
    desc: '无缝切换多种模型，在统一的聊天界面中续写对话，保持语境连贯，高效协作。',
    accent: 'warning',
  },
  {
    icon: Upload,
    title: '导出 Alpaca',
    desc: '一键将对话转换为标准 Alpaca JSON 格式，直接用于模型微调训练，数据即资产。',
    accent: 'info',
  },
]
</script>

<template>
  <div class="portal-home">
    <!-- ══════════ Hero ══════════ -->
    <section class="hero-section">
      <div class="hero-inner">
        <span class="hero-tag">
          <el-icon :size="14"><Promotion /></el-icon>
          <span>对话即资产 · 一站式管理</span>
        </span>

        <h1 class="hero-title">
          AI 对话资产，<span class="title-accent">一站式管理</span>
        </h1>

        <p class="hero-subtitle">
          轻松导入 Deepseek 导出数据，全文检索历史对话，可视化分析使用趋势，
          一键生成 AI 微调训练数据集，把 AI 对话变成真正属于你的资产。
        </p>

        <div class="hero-cta">
          <el-button type="primary" size="large" round @click="router.push('/register')">
            立即开始
            <el-icon class="btn-arrow"><ArrowRight /></el-icon>
          </el-button>
          <el-button size="large" round @click="router.push('/portal/features')">
            查看功能
          </el-button>
        </div>
      </div>
    </section>

    <!-- ══════════ 功能亮点 ══════════ -->
    <section class="highlights-section">
      <div class="highlights-inner">
        <div class="highlights-grid">
          <el-card
            v-for="item in highlights"
            :key="item.title"
            shadow="hover"
            class="highlight-card"
          >
            <div class="card-icon-wrap" :class="`accent-${item.accent}`">
              <el-icon :size="24"><component :is="item.icon" /></el-icon>
            </div>
            <h3 class="card-title">{{ item.title }}</h3>
            <p class="card-desc">{{ item.desc }}</p>
          </el-card>
        </div>
      </div>
    </section>

    <!-- ══════════ 注册引导横幅 ══════════ -->
    <section class="cta-banner-section">
      <div class="cta-banner-inner">
        <div class="cta-banner">
          <div class="banner-text">
            <h3 class="banner-title">准备好把 AI 对话变成你的资产了吗？</h3>
            <p class="banner-sub">
              免费注册，立即使用所有功能；首个注册用户自动成为管理员。
            </p>
          </div>
          <el-button class="banner-btn" size="large" round @click="router.push('/register')">
            立即免费注册
            <el-icon class="btn-arrow"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ══════════ Hero ══════════ */
.hero-section {
  padding: 76px 24px 56px;
  display: flex;
  justify-content: center;
}
.hero-inner {
  max-width: 860px;
  text-align: center;
}
.hero-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 24px;
}
.hero-title {
  font-size: 46px;
  line-height: 1.18;
  margin: 0 0 20px;
  letter-spacing: -0.02em;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.title-accent {
  color: var(--el-color-primary);
}
.hero-subtitle {
  font-size: 16px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  max-width: 640px;
  margin: 0 auto 32px;
}
.hero-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-arrow {
  margin-left: 4px;
}

/* ══════════ 功能亮点 ══════════ */
.highlights-section {
  padding: 16px 24px 40px;
  display: flex;
  justify-content: center;
}
.highlights-inner {
  max-width: 1200px;
  width: 100%;
}
.highlights-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.highlight-card :deep(.el-card__body) {
  padding: 24px 22px;
}
.card-icon-wrap {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
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
.accent-info {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
}
.card-title {
  font-size: 16.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 10px;
  line-height: 1.3;
}
.card-desc {
  font-size: 13.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.65;
  margin: 0;
}

/* ══════════ 注册引导横幅 ══════════ */
.cta-banner-section {
  padding: 24px 24px 80px;
  display: flex;
  justify-content: center;
}
.cta-banner-inner {
  max-width: 1200px;
  width: 100%;
}
.cta-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 34px 38px;
  border-radius: 12px;
  background: var(--el-color-primary);
}
.banner-text {
  flex: 1;
  min-width: 0;
}
.banner-title {
  font-size: 21px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px;
  line-height: 1.3;
}
.banner-sub {
  font-size: 14px;
  color: #fff;
  opacity: 0.88;
  margin: 0;
  line-height: 1.6;
}
.banner-btn {
  flex-shrink: 0;
  background: #fff;
  border-color: #fff;
  color: var(--el-color-primary);
  font-weight: 600;
}
.banner-btn:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-9);
}

@media (max-width: 960px) {
  .hero-section {
    padding: 52px 18px 36px;
  }
  .hero-title {
    font-size: 34px;
  }
  .hero-subtitle {
    font-size: 15px;
  }
  .highlights-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .cta-banner {
    flex-direction: column;
    align-items: flex-start;
    padding: 26px 22px;
  }
}
@media (max-width: 560px) {
  .hero-title {
    font-size: 28px;
  }
  .highlights-grid {
    grid-template-columns: 1fr;
  }
  .banner-btn {
    width: 100%;
  }
}
</style>
