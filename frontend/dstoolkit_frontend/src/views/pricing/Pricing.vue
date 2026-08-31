<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, ref, type Component } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Lightning,
  Star,
  Trophy,
  CircleCheck,
  Upload,
  Brush,
  Lock,
  Link,
  DataLine,
  Edit,
  User,
  Box,
  Service,
  Medal,
} from '@element-plus/icons-vue'
import { request } from '@/utils/request'
import { success } from '@/utils/sweetalert'
import { useAuthStore, type Tier } from '@/stores/auth'

// ═══════════ 类型 ═══════════
type Period = 'annual' | 'permanent'
type PaymentMethod = 'wechat' | 'alipay' | 'cardkey'
type ModalState = 'qr' | 'cardkey' | 'success'

interface BillingOption {
  period: Period
  price: number
  label: string
  unit: string
}

interface Feature {
  icon: Component
  text: string
  highlight?: boolean
}

interface TierInfo {
  id: Tier
  name: string
  badge: string
  tagline: string
  icon: Component
  recommend?: boolean
  billing: BillingOption[]
  features: Feature[]
}

// ═══════════ 套餐数据（FREE / PRO / PLUS / ULTIMATE 四档）═══════════
const tierMap: Record<Tier, TierInfo> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    badge: '免费版',
    tagline: '适合个人本地使用，开箱即用的对话管理',
    icon: markRaw(Lightning),
    billing: [{ period: 'permanent', price: 0, label: '免费', unit: '永久' }],
    features: [
      { icon: markRaw(CircleCheck), text: '本地对话存储（IndexedDB）', highlight: true },
      { icon: markRaw(Upload), text: '50MB 对话云存储 + 200 轮对话' },
      { icon: markRaw(Star), text: 'AI 摘要 5 次/天（免费体验）', highlight: true },
      { icon: markRaw(DataLine), text: '基础统计图表' },
      { icon: markRaw(Service), text: '社区支持' },
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    badge: '高级版',
    tagline: '适合个人轻度使用，解锁核心升级体验',
    icon: markRaw(Lightning),
    billing: [{ period: 'permanent', price: 39, label: '永久', unit: '一次买断' }],
    features: [
      { icon: markRaw(CircleCheck), text: 'Free 版全部功能', highlight: true },
      { icon: markRaw(Upload), text: '100MB 对话云存储 + 1000 轮对话' },
      { icon: markRaw(Brush), text: '网页完整版分享 + 5 种主题' },
      { icon: markRaw(Lock), text: '分享密码保护' },
      { icon: markRaw(DataLine), text: '更多高级图表' },
      { icon: markRaw(Service), text: '优先邮件支持' },
    ],
  },
  PLUS: {
    id: 'PLUS',
    name: 'Plus',
    badge: '顶级版',
    tagline: '适合重度分享用户，加入专属短链与内测',
    icon: markRaw(Star),
    billing: [
      { period: 'annual', price: 29, label: '年费', unit: '/ 年' },
      { period: 'permanent', price: 99, label: '永久', unit: '一次买断' },
    ],
    features: [
      { icon: markRaw(CircleCheck), text: 'Free 版全部功能', highlight: true },
      { icon: markRaw(Upload), text: '100MB 对话云存储 + 1000 轮对话' },
      { icon: markRaw(Brush), text: '网页完整版分享 + 5 种主题' },
      { icon: markRaw(Lock), text: '分享密码保护' },
      { icon: markRaw(Link), text: '个人专属短链（新增）', highlight: true },
      { icon: markRaw(DataLine), text: '更多高级图表' },
      { icon: markRaw(Box), text: '优先功能内测资格' },
      { icon: markRaw(Service), text: '专属客服通道' },
    ],
  },
  ULTIMATE: {
    id: 'ULTIMATE',
    name: 'Ultimate',
    badge: '超能版',
    tagline: '适合开发者与重度用户，解锁全部高级权益',
    icon: markRaw(Trophy),
    recommend: true,
    billing: [
      { period: 'annual', price: 59, label: '年费', unit: '/ 年' },
      { period: 'permanent', price: 199, label: '永久', unit: '一次买断' },
    ],
    features: [
      { icon: markRaw(CircleCheck), text: 'Free 版全部功能', highlight: true },
      { icon: markRaw(Upload), text: '300MB 对话云存储 + 1000 轮对话（升级）', highlight: true },
      { icon: markRaw(Brush), text: '网页完整版分享 + 5 种主题' },
      { icon: markRaw(Lock), text: '分享密码保护' },
      { icon: markRaw(Link), text: '个人专属短链' },
      { icon: markRaw(Edit), text: 'RESTful API 访问权限（新增）', highlight: true },
      { icon: markRaw(User), text: '网站作者专属好友位（新增）', highlight: true },
      { icon: markRaw(Edit), text: '开源版 PR 提交权限（新增）', highlight: true },
      { icon: markRaw(DataLine), text: '更多高级图表' },
      { icon: markRaw(Medal), text: '1 对 1 专属支持 + 功能定制建议权' },
    ],
  },
}
const tierOrder: Tier[] = ['FREE', 'PRO', 'PLUS', 'ULTIMATE']

// ═══════════ 支付方式 ═══════════
const paymentMethods: { id: PaymentMethod; name: string; desc: string; badge?: string }[] = [
  { id: 'wechat', name: '微信支付', desc: '推荐 · 扫码即付', badge: '推荐' },
  { id: 'alipay', name: '支付宝', desc: '扫码或跳转支付' },
  { id: 'cardkey', name: '卡密充值', desc: '备用方案 · 永久有效', badge: '备用' },
]

// ═══════════ AI 积分充值包 ═══════════
interface CreditPack {
  id: string
  credits: number
  price: number
  label: string
  popular: boolean
}
const creditPacks: CreditPack[] = [
  { id: 'pack_500', credits: 500, price: 9.9, label: '500 积分', popular: false },
  { id: 'pack_2000', credits: 2000, price: 29, label: '2000 积分', popular: true },
  { id: 'pack_10000', credits: 10000, price: 99, label: '10000 积分', popular: false },
]
const purchasingPack = ref<string | null>(null)

function packSummaryCount(credits: number): number {
  return Math.floor(credits / 10)
}

// ═══════════ 权益对照表 ═══════════
type CompareValue = boolean | string
interface CompareRow {
  label: string
  values: CompareValue[]
}
const compareRows: CompareRow[] = [
  { label: '本地对话存储（IndexedDB）', values: [true, true, true, true] },
  { label: '对话云存储', values: ['50MB · 200 轮', '100MB · 1000 轮', '100MB · 1000 轮', '300MB · 1000 轮'] },
  { label: 'AI 摘要', values: ['5 次/天（体验）', true, true, true] },
  { label: '统计图表', values: ['基础', '高级', '高级', '高级'] },
  { label: '网页完整版分享 + 5 种主题', values: [false, true, true, true] },
  { label: '分享密码保护', values: [false, true, true, true] },
  { label: '个人专属短链', values: [false, false, true, true] },
  { label: '优先功能内测资格', values: [false, false, true, true] },
  { label: 'RESTful API 访问权限', values: [false, false, false, true] },
  { label: '网站作者好友位 / 开源 PR 权限', values: [false, false, false, true] },
  { label: '支持渠道', values: ['社区支持', '优先邮件支持', '专属客服通道', '1 对 1 专属支持'] },
]

function cellType(v: CompareValue | undefined): 'yes' | 'no' | 'text' {
  if (v === true) return 'yes'
  if (v === false) return 'no'
  return 'text'
}
function cellText(v: CompareValue | undefined): string {
  if (v === true) return '✓'
  if (v === false) return '—'
  return v ?? '—'
}

// ═══════════ 状态 ═══════════
const auth = useAuthStore()
const selectedTier = ref<Tier>('PLUS')
const selectedBilling = ref<Partial<Record<Tier, Period>>>({ PLUS: 'annual', ULTIMATE: 'annual' })
const selectedPayment = ref<PaymentMethod>('wechat')

const paymentConfig = ref<{
  methods: { wechat: boolean; alipay: boolean; cardkey: boolean }
  cardKeyShopUrl?: string
  cardKeyDocsUrl?: string
} | null>(null)
const configLoading = ref(true)

const showModal = ref(false)
const modalState = ref<ModalState>('qr')
const cardKeyInput = ref('')
const redeeming = ref(false)
const creatingOrder = ref(false)
const countdown = ref(900)
let timer: number | null = null

// ═══════════ 计算属性 ═══════════
const FALLBACK_BILLING: BillingOption = { period: 'permanent', price: 0, label: '免费', unit: '永久' }

function billingFor(id: Tier): BillingOption {
  const billing = tierMap[id].billing
  const period = selectedBilling.value[id] ?? billing[0]?.period
  return billing.find((b) => b.period === period) ?? billing[0] ?? FALLBACK_BILLING
}

const currentBilling = computed<BillingOption>(() => billingFor(selectedTier.value))
const currentPrice = computed(() => currentBilling.value.price)

function isCurrent(id: Tier): boolean {
  return auth.effectiveTier === id
}

const methodAvailability = computed<Record<PaymentMethod, boolean>>(() => {
  const cfg = paymentConfig.value
  if (!cfg) return { wechat: false, alipay: false, cardkey: true }
  return {
    wechat: !!cfg.methods.wechat,
    alipay: !!cfg.methods.alipay,
    cardkey: cfg.methods.cardkey !== false, // 默认开启卡密
  }
})

const cardKeyShopUrl = computed(
  () => paymentConfig.value?.cardKeyShopUrl || 'https://www.kufaka.com/shop/DLJTWXUW',
)

// ═══════════ 方法 ═══════════
async function loadPaymentConfig(): Promise<void> {
  configLoading.value = true
  try {
    const res: any = await request.get('/payment/config')
    paymentConfig.value = {
      methods: {
        wechat: !!res.methods?.wechat,
        alipay: !!res.methods?.alipay,
        cardkey: res.methods?.cardkey !== false,
      },
      cardKeyShopUrl: res.cardKeyShopUrl,
      cardKeyDocsUrl: res.cardKeyDocsUrl,
    }
  } catch {
    paymentConfig.value = {
      methods: { wechat: false, alipay: false, cardkey: true },
      cardKeyShopUrl: 'https://www.kufaka.com/shop/DLJTWXUW',
    }
  } finally {
    configLoading.value = false
    if (!methodAvailability.value.wechat && methodAvailability.value.alipay) {
      selectedPayment.value = 'alipay'
    } else if (!methodAvailability.value.wechat && !methodAvailability.value.alipay) {
      selectedPayment.value = 'cardkey'
    }
  }
}

function selectTier(id: Tier): void {
  selectedTier.value = id
}

function onBillingChange(id: Tier, val: string | number | boolean | undefined): void {
  selectedBilling.value[id] = val as Period
}

function selectPayment(method: PaymentMethod): void {
  selectedPayment.value = method
}

function startCheckout(): void {
  const method = selectedPayment.value
  if (!methodAvailability.value[method]) {
    ElMessage.info('当前支付方式暂未开通，已为你切换到卡密充值')
    selectedPayment.value = 'cardkey'
    modalState.value = 'cardkey'
    showModal.value = true
    return
  }
  if (method === 'cardkey') {
    modalState.value = 'cardkey'
    showModal.value = true
    return
  }
  modalState.value = 'qr'
  showModal.value = true
  countdown.value = 900
  createOrder()
}

async function createOrder(): Promise<void> {
  creatingOrder.value = true
  try {
    await request.post('/payment/order', {
      tier: selectedTier.value.toLowerCase(),
      period: currentBilling.value.period,
      method: selectedPayment.value,
    })
    startTimer()
  } catch {
    startTimer()
  } finally {
    creatingOrder.value = false
  }
}

function startTimer(): void {
  if (timer) window.clearInterval(timer)
  timer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      stopTimer()
    }
  }, 1000)
}

function stopTimer(): void {
  if (timer) {
    window.clearInterval(timer)
    timer = null
  }
}

function formatCountdown(s: number): string {
  const m = Math.max(0, Math.floor(s / 60))
  const sec = Math.max(0, s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function closePayment(): void {
  showModal.value = false
  stopTimer()
  cardKeyInput.value = ''
}

async function redeemCardKey(): Promise<void> {
  const key = cardKeyInput.value.trim()
  if (!key) {
    ElMessage.warning('请输入卡密')
    return
  }
  redeeming.value = true
  try {
    const res: any = await request.post('/payment/redeem', {
      cardKey: key,
      tier: selectedTier.value.toLowerCase(),
      period: currentBilling.value.period,
    })
    ElMessage.success(res?.message || '卡密兑换成功，权益已到账')
    modalState.value = 'success'
  } catch {
    ElMessage.error(
      '卡密兑换接口尚未启用，请联系管理员手动绑定，或前往卡密购买页确认商品',
    )
  } finally {
    redeeming.value = false
  }
}

function confirmPaid(): void {
  success('支付完成', '权益将在几分钟内到账')
  closePayment()
}

function switchPaymentInModal(): void {
  closePayment()
}

function openCardKeyShop(): void {
  window.open(cardKeyShopUrl.value, '_blank')
}

function openCardKeyDocs(): void {
  const url = paymentConfig.value?.cardKeyDocsUrl
  if (url) window.open(url, '_blank')
}

async function purchaseCreditPack(packId: string): Promise<void> {
  purchasingPack.value = packId
  try {
    const res: any = await request.post('/subscription/credits/purchase', { packId })
    success('充值成功', res?.message || '积分已到账')
  } finally {
    purchasingPack.value = null
  }
}

onMounted(loadPaymentConfig)
onUnmounted(stopTimer)
</script>

<template>
  <div class="pricing-page">
    <!-- ═══════════ 页头 ═══════════ -->
    <el-card shadow="never" class="page-head-card">
      <div class="page-head-row">
        <div>
          <h2 class="page-title">会员定价与升级</h2>
          <p class="page-sub">
            选择适合你的方案，解锁更多对话云存储、自定义分享服务与高级功能。
            Pro 仅提供永久买断；Plus 与 Ultimate 支持年费订阅与永久买断两档。
          </p>
        </div>
        <div class="page-head-tier">
          <span class="head-tier-label">当前档位</span>
          <el-tag effect="dark" size="large">{{ auth.effectiveTier }}</el-tag>
        </div>
      </div>
    </el-card>

    <!-- ═══════════ 套餐卡片 ═══════════ -->
    <section class="tier-grid">
      <el-card
        v-for="id in tierOrder"
        :key="id"
        shadow="hover"
        class="tier-card"
        :class="{
          'tier-card--current': isCurrent(id),
          'tier-card--selected': selectedTier === id && !isCurrent(id),
        }"
      >
        <div class="tier-badges">
          <el-tag v-if="isCurrent(id)" type="success" size="small" effect="dark">当前档位</el-tag>
          <el-tag
            v-else-if="tierMap[id].recommend"
            type="warning"
            size="small"
            effect="dark"
          >推荐</el-tag>
          <el-tag v-if="selectedTier === id && !isCurrent(id)" size="small" effect="light">
            已选择
          </el-tag>
        </div>

        <div class="tier-head">
          <div class="tier-icon">
            <el-icon :size="20"><component :is="tierMap[id].icon" /></el-icon>
          </div>
          <div class="tier-name-block">
            <div class="tier-name">{{ tierMap[id].name }}</div>
            <div class="tier-badge-text">{{ tierMap[id].badge }}</div>
          </div>
        </div>

        <p class="tier-tagline">{{ tierMap[id].tagline }}</p>

        <div v-if="tierMap[id].billing.length > 1" class="billing-toggle">
          <el-radio-group
            :model-value="billingFor(id).period"
            size="small"
            @update:model-value="onBillingChange(id, $event)"
          >
            <el-radio-button
              v-for="b in tierMap[id].billing"
              :key="b.period"
              :value="b.period"
            >
              {{ b.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div class="tier-price">
          <span class="currency">¥</span>
          <span class="price-num">{{ billingFor(id).price }}</span>
          <span class="price-unit">{{ billingFor(id).unit }}</span>
        </div>

        <ul class="tier-features">
          <li
            v-for="(f, i) in tierMap[id].features"
            :key="i"
            :class="{ highlight: f.highlight }"
          >
            <el-icon :size="14" class="feature-icon"><component :is="f.icon" /></el-icon>
            <span>{{ f.text }}</span>
          </li>
        </ul>

        <el-button
          v-if="isCurrent(id)"
          type="success"
          plain
          disabled
          class="tier-cta"
        >
          当前档位
        </el-button>
        <el-button
          v-else
          class="tier-cta"
          :type="selectedTier === id ? 'primary' : 'default'"
          :plain="selectedTier !== id"
          @click="selectTier(id)"
        >
          升级到 {{ tierMap[id].name }}
          <el-icon :size="14"><ArrowRight /></el-icon>
        </el-button>
      </el-card>
    </section>

    <!-- ═══════════ 套餐权益对照 ═══════════ -->
    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <h3 class="card-title">套餐权益对照</h3>
          <p class="card-sub">所有方案均享受 Free 版全部功能，权益即时生效</p>
        </div>
      </template>
      <el-table :data="compareRows" size="small" border style="width: 100%">
        <el-table-column prop="label" label="权益" min-width="220" />
        <el-table-column v-for="(id, idx) in tierOrder" :key="id" align="center" min-width="130">
          <template #header>
            <span class="th-tier">
              {{ tierMap[id].name }}
              <el-tag v-if="isCurrent(id)" type="success" size="small" effect="plain">当前</el-tag>
            </span>
          </template>
          <template #default="{ row }">
            <el-tag
              v-if="cellType(row.values[idx]) === 'yes'"
              type="success"
              effect="plain"
              size="small"
            >
              ✓
            </el-tag>
            <span v-else-if="cellType(row.values[idx]) === 'no'" class="cell-na">—</span>
            <span v-else class="cell-text">{{ cellText(row.values[idx]) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ═══════════ AI 积分充值包 ═══════════ -->
    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <h3 class="card-title">AI 积分充值包</h3>
          <p class="card-sub">
            AI 积分可用于：摘要生成(10)、知识卡片(15)、AI 整理(30)、导出润色(30)
          </p>
        </div>
      </template>
      <div class="pack-grid">
        <el-card
          v-for="pack in creditPacks"
          :key="pack.id"
          shadow="hover"
          class="pack-card"
          :class="{ 'pack-card--popular': pack.popular }"
        >
          <div class="pack-badges">
            <el-tag v-if="pack.popular" type="primary" size="small" effect="dark">热门</el-tag>
          </div>
          <div class="pack-credits">
            <span class="pack-credits-num">{{ pack.credits }}</span>
            <span class="pack-credits-suffix">积分</span>
          </div>
          <div class="pack-price">
            <span class="currency">¥</span>
            <span class="pack-price-num">{{ pack.price }}</span>
          </div>
          <p class="pack-desc">约可生成 {{ packSummaryCount(pack.credits) }} 次 AI 摘要</p>
          <el-button
            class="pack-cta"
            :type="pack.popular ? 'primary' : 'default'"
            :plain="!pack.popular"
            :loading="purchasingPack === pack.id"
            :disabled="purchasingPack !== null && purchasingPack !== pack.id"
            @click="purchaseCreditPack(pack.id)"
          >
            购买
          </el-button>
        </el-card>
      </div>
    </el-card>

    <!-- ═══════════ 支付方式与结算 ═══════════ -->
    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <h3 class="card-title">选择支付方式</h3>
          <p class="card-sub">
            当前已选：
            <strong class="selected-text">{{ tierMap[selectedTier].name }} · {{ currentBilling.label }}</strong>
            · 应付 <span class="amount-due">¥{{ currentPrice }}</span>
          </p>
        </div>
      </template>

      <div v-loading="configLoading" class="payment-block">
        <div class="payment-radio-row">
          <el-radio-group
            :model-value="selectedPayment"
            :disabled="configLoading"
            @update:model-value="selectPayment($event as PaymentMethod)"
          >
            <el-radio-button
              v-for="m in paymentMethods"
              :key="m.id"
              :value="m.id"
              :disabled="!methodAvailability[m.id]"
            >
              {{ m.name }}
              <template v-if="m.badge"> · {{ m.badge }}</template>
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="pm-desc-row">
          <span
            v-for="m in paymentMethods"
            :key="m.id"
            class="pm-desc"
            :class="{ 'pm-desc--off': !methodAvailability[m.id] }"
          >
            {{ m.name }}：{{ methodAvailability[m.id] ? m.desc : '未开通 · 自动切换到卡密' }}
          </span>
        </div>

        <el-alert
          v-if="!configLoading && selectedPayment === 'cardkey'"
          type="warning"
          show-icon
          :closable="false"
          class="cardkey-alert"
        >
          <template #title>
            卡密充值说明：免支付兜底方案，永久有效，适合无法使用微信/支付宝的用户。
            购买地址：<a :href="cardKeyShopUrl" target="_blank" rel="noopener" class="alert-link">{{ cardKeyShopUrl }}</a>
          </template>
        </el-alert>

        <div class="checkout-bar">
          <div class="checkout-summary">
            <span class="summary-label">应付金额</span>
            <span class="summary-price">
              ¥{{ currentPrice }}
              <span class="summary-unit">/ {{ currentBilling.label }}</span>
            </span>
          </div>
          <el-button
            type="primary"
            size="large"
            :loading="creatingOrder"
            :disabled="configLoading"
            @click="startCheckout"
          >
            立即升级 {{ tierMap[selectedTier].name }}
            <el-icon :size="14"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- ═══════════ 底部说明 ═══════════ -->
    <div class="pricing-footer">
      <span class="footer-item">年费方案到期前 7 天将通过站内消息提醒续费</span>
      <span class="footer-item">购买与权益问题请通过个人中心反馈，管理员会尽快处理</span>
    </div>

    <!-- ═══════════ 支付对话框 ═══════════ -->
    <el-dialog
      v-model="showModal"
      :title="modalState === 'qr'
        ? (selectedPayment === 'wechat' ? '微信支付' : '支付宝')
        : (modalState === 'cardkey' ? '卡密充值' : '支付完成')"
      width="480px"
      :close-on-click-modal="false"
      @closed="closePayment"
    >
      <div class="pay-summary">
        <div class="pay-summary-left">
          <div class="pay-tier-icon">
            <el-icon :size="16"><component :is="tierMap[selectedTier].icon" /></el-icon>
          </div>
          <div>
            <div class="pay-tier-name">
              {{ tierMap[selectedTier].name }} · {{ tierMap[selectedTier].badge }}
            </div>
            <div class="pay-tier-period">{{ currentBilling.label }} · {{ currentBilling.unit }}</div>
          </div>
        </div>
        <div class="pay-summary-price">¥{{ currentPrice }}</div>
      </div>

      <!-- 扫码支付 -->
      <div v-if="modalState === 'qr'" v-loading="creatingOrder" class="pay-body">
        <div class="qr-block">
          <div class="qr-frame">
            <svg viewBox="0 0 100 100" width="180" height="180" aria-hidden="true">
              <defs>
                <pattern id="qrpat" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                  <rect width="10" height="10" fill="#0F172A" />
                  <rect x="2" y="2" width="6" height="6" fill="#FFFFFF" />
                  <rect x="2" y="2" width="3" height="3" fill="#0F172A" />
                  <rect x="6" y="6" width="2" height="2" fill="#0F172A" />
                </pattern>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="url(#qrpat)" />
              <rect x="4" y="4" width="22" height="22" fill="#FFFFFF" stroke="#0F172A" stroke-width="3" />
              <rect x="10" y="10" width="10" height="10" fill="#0F172A" />
              <rect x="74" y="4" width="22" height="22" fill="#FFFFFF" stroke="#0F172A" stroke-width="3" />
              <rect x="80" y="10" width="10" height="10" fill="#0F172A" />
              <rect x="4" y="74" width="22" height="22" fill="#FFFFFF" stroke="#0F172A" stroke-width="3" />
              <rect x="10" y="80" width="10" height="10" fill="#0F172A" />
              <rect x="40" y="40" width="20" height="20" rx="4" fill="#FFFFFF" />
            </svg>
          </div>
          <div class="qr-hint">
            请使用<strong>{{ selectedPayment === 'wechat' ? '微信' : '支付宝' }}</strong>扫描二维码完成支付
          </div>
          <div class="qr-timer">
            <el-icon :size="13"><Timer /></el-icon>
            <span class="timer-text" :class="{ urgent: countdown < 60 }">
              {{ countdown > 0 ? `${formatCountdown(countdown)} 后过期` : '已过期，请重新发起' }}
            </span>
            <el-button
              v-if="countdown <= 0"
              type="primary"
              plain
              size="small"
              @click="startCheckout"
            >
              <el-icon :size="12"><Refresh /></el-icon>
              重新生成
            </el-button>
          </div>
        </div>
      </div>

      <!-- 卡密兑换 -->
      <div v-else-if="modalState === 'cardkey'" class="pay-body">
        <div class="cardkey-block">
          <p class="cardkey-desc">
            请输入与所选套餐匹配的卡密（{{ tierMap[selectedTier].name }} · {{ currentBilling.label }}），
            提交后系统将自动校验并为你开通对应权益。
          </p>
          <el-input
            v-model="cardKeyInput"
            type="textarea"
            :rows="3"
            placeholder="粘贴你购买后获得的卡密（形如 DSTK-XXXX-XXXX-XXXX）"
          />
          <div class="cardkey-actions">
            <el-button plain size="small" @click="openCardKeyDocs">
              <el-icon :size="14"><Link /></el-icon>
              查看卡密说明
            </el-button>
            <el-button type="primary" size="small" @click="openCardKeyShop">
              前往购买卡密
              <el-icon :size="12"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 兑换成功 -->
      <div v-else class="pay-body">
        <div class="pay-success">
          <el-icon :size="48" class="success-icon"><CircleCheck /></el-icon>
          <div class="success-title">兑换成功</div>
          <p class="success-desc">
            你已成功开通<strong>{{ tierMap[selectedTier].name }} · {{ currentBilling.label }}</strong>，
            相关权益将在几分钟内生效。如未即时到账，请刷新页面或联系管理员。
          </p>
        </div>
      </div>

      <template #footer>
        <template v-if="modalState === 'qr'">
          <el-button plain @click="switchPaymentInModal">
            <el-icon :size="14"><Refresh /></el-icon>
            切换支付方式
          </el-button>
          <el-button type="primary" @click="confirmPaid">我已完成支付</el-button>
        </template>
        <template v-else-if="modalState === 'cardkey'">
          <el-button plain @click="closePayment">取消</el-button>
          <el-button
            type="primary"
            :loading="redeeming"
            :disabled="!cardKeyInput.trim()"
            @click="redeemCardKey"
          >
            提交兑换
          </el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="closePayment">完成</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pricing-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页头 */
.page-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head-card .page-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.page-head-card .page-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  max-width: 640px;
}
.page-head-tier {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 14px;
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
}
.head-tier-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 卡片标题 */
.card-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.card-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* ═══════════ 套餐卡片 ═══════════ */
.tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}
.tier-card {
  display: flex;
  flex-direction: column;
}
.tier-card--current {
  border: 1px solid var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.tier-card--selected {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5);
}
.tier-badges {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  min-height: 24px;
}
.tier-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.tier-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  flex-shrink: 0;
}
.tier-name {
  font-size: 19px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}
.tier-badge-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.tier-tagline {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.55;
  margin: 0 0 14px;
  min-height: 40px;
}
.billing-toggle {
  margin-bottom: 12px;
}
.tier-price {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 14px;
}
.currency {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.price-num {
  font-size: 38px;
  font-weight: 700;
  line-height: 1;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.price-unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tier-features {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.tier-features li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--el-text-color-secondary);
}
.tier-features li.highlight {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.feature-icon {
  color: var(--el-color-success);
  flex-shrink: 0;
  margin-top: 2px;
}
.tier-cta {
  width: 100%;
}

/* ═══════════ 权益对照表 ═══════════ */
.th-tier {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cell-na {
  color: var(--el-text-color-placeholder);
}
.cell-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

/* ═══════════ 积分充值包 ═══════════ */
.pack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.pack-card {
  text-align: center;
}
.pack-card--popular {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.pack-badges {
  display: flex;
  justify-content: flex-end;
  min-height: 22px;
}
.pack-credits {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-bottom: 6px;
}
.pack-credits-num {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.pack-credits-suffix {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.pack-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
  margin-bottom: 6px;
}
.pack-price .currency {
  color: var(--el-color-primary);
}
.pack-price-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}
.pack-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 14px;
}
.pack-cta {
  width: 100%;
}

/* ═══════════ 支付方式 ═══════════ */
.payment-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100px;
}
.payment-radio-row {
  display: flex;
  flex-wrap: wrap;
}
.pm-desc-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.pm-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pm-desc--off {
  color: var(--el-text-color-placeholder);
}
.cardkey-alert .alert-link {
  color: var(--el-color-primary);
  font-weight: 600;
  text-decoration: none;
  word-break: break-all;
}
.cardkey-alert .alert-link:hover {
  text-decoration: underline;
}
.selected-text {
  color: var(--el-color-primary);
  font-weight: 600;
}
.amount-due {
  color: var(--el-color-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.checkout-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.checkout-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.summary-price {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}
.summary-unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

/* 底部说明 */
.pricing-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}
.footer-item {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

/* ═══════════ 支付对话框 ═══════════ */
.pay-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 16px;
}
.pay-summary-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pay-tier-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  flex-shrink: 0;
}
.pay-tier-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.pay-tier-period {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.pay-summary-price {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}
.pay-body {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.qr-frame {
  padding: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: #ffffff;
}
.qr-hint {
  font-size: 13px;
  color: var(--el-text-color-regular);
  text-align: center;
}
.qr-hint strong {
  color: var(--el-text-color-primary);
}
.qr-timer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.timer-text {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.timer-text.urgent {
  color: var(--el-color-danger);
}
.cardkey-block {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cardkey-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  margin: 0;
}
.cardkey-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.pay-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.success-icon {
  color: var(--el-color-success);
}
.success-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.success-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin: 0;
  max-width: 340px;
}
.success-desc strong {
  color: var(--el-color-primary);
}

/* 响应式 */
@media (max-width: 960px) {
  .checkout-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
