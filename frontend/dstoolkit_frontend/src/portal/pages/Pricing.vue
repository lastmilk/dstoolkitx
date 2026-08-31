<script setup lang="ts">
/**
 * Pricing.vue（Element Plus 版价格页）
 *  - 三档价格卡片（el-card，Pro 高亮：主色边框 + 顶部标签条）
 *  - 功能对比表（el-table，布尔值渲染 Check / CircleClose 图标）
 *  - 常见问题（el-collapse）
 */
import { ref } from 'vue'
import { Check, CircleClose, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

interface PricingTier {
  name: string
  price: string
  period: string
  highlight: boolean
  highlightLabel?: string
  features: string[]
  buttonLabel: string
  buttonType: 'primary' | ''
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: '¥0',
    period: '/ 永久免费',
    highlight: false,
    features: [
      '导入最多 5 个 Deepseek 账号',
      '对话全文检索（基础版）',
      '数据可视化面板',
      'Alpaca 格式导出（每次 100 条）',
      '基础主题与背景',
      '社区支持',
    ],
    buttonLabel: '免费使用',
    buttonType: '',
  },
  {
    name: 'Pro',
    price: '¥29',
    period: '/ 月',
    highlight: true,
    highlightLabel: 'Most Popular',
    features: [
      '导入无限 Deepseek 账号',
      '高级全文检索 + 正则筛选',
      '完整数据可视化 + 导出报表',
      'Alpaca 格式导出（无限量）',
      '全部主题 + 自定义背景',
      'OAuth 授权能力',
      '邀请返利资格',
      '优先邮件支持',
    ],
    buttonLabel: '立即升级',
    buttonType: 'primary',
  },
  {
    name: 'Enterprise',
    price: '¥199',
    period: '/ 月',
    highlight: false,
    features: [
      'Pro 全部功能',
      '团队协作（最多 20 席）',
      'SSO / 私有部署支持',
      '专属 API 配额提升',
      '模型市场优先体验',
      '7×24 小时专属客服',
      '定制化开发咨询',
      'SLA 服务保障',
    ],
    buttonLabel: '联系销售',
    buttonType: '',
  },
]

interface CompareRow {
  feature: string
  free: string | boolean
  pro: string | boolean
  enterprise: string | boolean
}

const compareRows: CompareRow[] = [
  { feature: '可导入账号数', free: '5 个', pro: '无限', enterprise: '无限' },
  { feature: '全文检索能力', free: '基础', pro: '高级 + 正则', enterprise: '高级 + 正则' },
  { feature: 'Alpaca 导出上限', free: '100 条 / 次', pro: '无限', enterprise: '无限' },
  { feature: 'OAuth 授权', free: false, pro: true, enterprise: true },
  { feature: '邀请返利', free: false, pro: true, enterprise: true },
  { feature: '团队协作', free: false, pro: false, enterprise: '20 席位' },
  { feature: 'SSO / 私有部署', free: false, pro: false, enterprise: true },
  { feature: '客服支持', free: '社区', pro: '优先邮件', enterprise: '7×24 专属' },
]

interface FaqItem {
  title: string
  content: string
}

const faqItems: FaqItem[] = [
  {
    title: 'Free 版和 Pro 版有什么核心区别？',
    content:
      'Free 版适合个人轻度使用，限制 5 个账号导入、每次 Alpaca 导出 100 条；Pro 版解锁所有高级功能，包括无限账号、无限导出、正则检索、OAuth 授权和邀请返利等。',
  },
  {
    title: '可以随时升级或降级套餐吗？',
    content:
      '是的，你可以随时在个人中心升级套餐，升级后立即生效。降级则会在当前计费周期结束后生效，期间你仍可享受已付费套餐的全部权益。',
  },
  {
    title: '数据安全如何保障？',
    content:
      '我们采用业界标准的端到端加密存储，对话数据默认仅你本人可见。企业版支持 SSO 和私有部署方案，满足合规与数据主权要求。',
  },
  {
    title: '邀请返利如何结算？',
    content:
      '好友通过你的邀请链接注册并升级 Pro 及以上套餐后，双方均会获得等价积分。积分可用于抵扣订阅费用或兑换模型调用额度，详情见邀请页面。',
  },
  {
    title: '支持哪些支付方式？',
    content:
      '目前支持微信支付、支付宝和主流信用卡。企业版支持对公转账并开具增值税发票。支付通道持续建设中，更多方式即将上线。',
  },
]

const activeNames = ref<string[]>(['1'])

function handleBuy(tierName: string) {
  if (tierName === 'Free') {
    ElMessage.info('免费版无需支付，注册即可使用~')
  } else {
    ElMessage.info('支付通道建设中…')
  }
}
</script>

<template>
  <div class="portal-pricing">
    <!-- ══════════ 标题 ══════════ -->
    <section class="pricing-hero">
      <div class="pricing-hero-inner">
        <h1 class="pricing-title">灵活方案，<span class="title-accent">按需选择</span></h1>
        <p class="pricing-subtitle">
          从个人免费版到团队企业版，总有一款适合你。所有套餐均支持 7 天无理由退款。
        </p>
      </div>
    </section>

    <!-- ══════════ 价格卡片 ══════════ -->
    <section class="pricing-cards-section">
      <div class="pricing-cards-inner">
        <div class="pricing-cards">
          <el-card
            v-for="tier in tiers"
            :key="tier.name"
            shadow="hover"
            class="pricing-card"
            :class="{ 'is-highlight': tier.highlight }"
          >
            <div v-if="tier.highlight" class="highlight-stripe">
              <el-icon :size="12"><Check /></el-icon>
              <span>{{ tier.highlightLabel }}</span>
            </div>

            <div class="tier-name">{{ tier.name }}</div>
            <div class="tier-price-row">
              <span class="tier-price">{{ tier.price }}</span>
              <span class="tier-period">{{ tier.period }}</span>
            </div>

            <ul class="tier-features">
              <li v-for="(feat, fi) in tier.features" :key="fi" class="tier-feat">
                <el-icon :size="15" class="feat-check"><Check /></el-icon>
                <span>{{ feat }}</span>
              </li>
            </ul>

            <el-button
              :type="tier.buttonType"
              size="large"
              class="tier-btn"
              @click="handleBuy(tier.name)"
            >
              {{ tier.buttonLabel }}
              <el-icon v-if="tier.buttonType === 'primary'" class="btn-arrow">
                <ArrowRight />
              </el-icon>
            </el-button>
          </el-card>
        </div>
      </div>
    </section>

    <!-- ══════════ 功能对比 ══════════ -->
    <section class="compare-section">
      <div class="compare-inner">
        <h2 class="section-title">功能对比</h2>
        <el-table :data="compareRows" border class="compare-table">
          <el-table-column prop="feature" label="功能" min-width="200">
            <template #default="{ row }">
              <span class="compare-feat-name">{{ row.feature }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Free" align="center" min-width="120">
            <template #default="{ row }">
              <template v-if="typeof row.free === 'boolean'">
                <el-icon v-if="row.free" :size="18" class="check-yes"><Check /></el-icon>
                <el-icon v-else :size="18" class="check-no"><CircleClose /></el-icon>
              </template>
              <span v-else class="compare-text">{{ row.free }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Pro" align="center" min-width="120" class-name="col-pro">
            <template #default="{ row }">
              <template v-if="typeof row.pro === 'boolean'">
                <el-icon v-if="row.pro" :size="18" class="check-yes"><Check /></el-icon>
                <el-icon v-else :size="18" class="check-no"><CircleClose /></el-icon>
              </template>
              <span v-else class="compare-text">{{ row.pro }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Enterprise" align="center" min-width="140">
            <template #default="{ row }">
              <template v-if="typeof row.enterprise === 'boolean'">
                <el-icon v-if="row.enterprise" :size="18" class="check-yes"><Check /></el-icon>
                <el-icon v-else :size="18" class="check-no"><CircleClose /></el-icon>
              </template>
              <span v-else class="compare-text">{{ row.enterprise }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <!-- ══════════ 常见问题 ══════════ -->
    <section class="faq-section">
      <div class="faq-inner">
        <h2 class="section-title">常见问题</h2>
        <el-collapse v-model="activeNames" class="faq-collapse">
          <el-collapse-item
            v-for="(faq, idx) in faqItems"
            :key="idx"
            :name="String(idx + 1)"
            :title="faq.title"
          >
            <div class="faq-content">{{ faq.content }}</div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ══════════ 标题 ══════════ */
.pricing-hero {
  padding: 68px 24px 44px;
  display: flex;
  justify-content: center;
}
.pricing-hero-inner {
  max-width: 720px;
  text-align: center;
}
.pricing-title {
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
.pricing-subtitle {
  font-size: 15.5px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0;
}

/* ══════════ 价格卡片 ══════════ */
.pricing-cards-section {
  padding: 4px 24px 44px;
  display: flex;
  justify-content: center;
}
.pricing-cards-inner {
  max-width: 1200px;
  width: 100%;
}
.pricing-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  align-items: stretch;
}
.pricing-card {
  position: relative;
  display: flex;
  flex-direction: column;
}
.pricing-card :deep(.el-card__body) {
  padding: 28px 26px 24px;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.pricing-card.is-highlight {
  border-color: var(--el-color-primary);
}
.highlight-stripe {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 0 0 8px 8px;
  letter-spacing: 0.02em;
  z-index: 2;
}
.tier-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.is-highlight .tier-name {
  color: var(--el-color-primary);
}
.tier-price-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 20px;
}
.tier-price {
  font-size: 38px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1;
}
.tier-period {
  font-size: 13.5px;
  color: var(--el-text-color-secondary);
}
.tier-features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.tier-feat {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 13.5px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}
.feat-check {
  color: var(--el-color-success);
  margin-top: 2px;
  flex-shrink: 0;
}
.tier-btn {
  width: 100%;
}
.tier-btn .btn-arrow {
  margin-left: 4px;
}

/* ══════════ 功能对比 ══════════ */
.compare-section {
  padding: 8px 24px 44px;
  display: flex;
  justify-content: center;
}
.compare-inner {
  max-width: 1200px;
  width: 100%;
}
.section-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  text-align: center;
  margin: 0 0 22px;
}
.compare-table {
  --el-table-header-bg-color: var(--el-fill-color-light);
  --el-table-row-hover-bg-color: var(--el-color-primary-light-9);
}
.compare-table :deep(.col-pro) {
  background: var(--el-color-primary-light-9);
}
.compare-feat-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 13.5px;
}
.compare-text {
  font-size: 13.5px;
  color: var(--el-text-color-regular);
}
.check-yes {
  color: var(--el-color-success);
}
.check-no {
  color: var(--el-text-color-placeholder);
}

/* ══════════ 常见问题 ══════════ */
.faq-section {
  padding: 8px 24px 80px;
  display: flex;
  justify-content: center;
}
.faq-inner {
  max-width: 900px;
  width: 100%;
}
.faq-collapse :deep(.el-collapse-item__header) {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 14.5px;
}
.faq-collapse :deep(.el-collapse-item__header:hover) {
  color: var(--el-color-primary);
}
.faq-content {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 960px) {
  .pricing-hero {
    padding: 48px 18px 28px;
  }
  .pricing-title {
    font-size: 30px;
  }
  .pricing-cards {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .pricing-cards-section,
  .compare-section,
  .faq-section {
    padding-left: 18px;
    padding-right: 18px;
  }
}
@media (max-width: 560px) {
  .pricing-title {
    font-size: 25px;
  }
  .tier-price {
    font-size: 32px;
  }
  .section-title {
    font-size: 20px;
  }
}
</style>
