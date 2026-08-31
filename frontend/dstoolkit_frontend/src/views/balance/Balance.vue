<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '@/utils/request'
import type { ApiKeyItem } from '@/types'

// /balance/{keyId} 响应结构（沿用旧版）：
// { balance: { isAvailable: boolean, balanceInfos: Array<{ totalBalance, grantedBalance, toppedUpBalance, currency? }> } }
interface BalanceInfo {
  totalBalance?: number | string
  grantedBalance?: number | string
  toppedUpBalance?: number | string
  currency?: string
}

interface BalanceResult {
  isAvailable?: boolean
  balanceInfos?: BalanceInfo[]
}

const apiKeys = ref<ApiKeyItem[]>([])
const keyId = ref<number | null>(null)
const loading = ref(false)
const result = ref<BalanceResult | null>(null)

async function loadKeys(): Promise<void> {
  const res: any = await request.get('/apikeys')
  apiKeys.value = (res.apiKeys ?? []) as ApiKeyItem[]
}

async function query(): Promise<void> {
  if (!keyId.value) return
  loading.value = true
  result.value = null
  try {
    const res: any = await request.get(`/balance/${keyId.value}`)
    result.value = (res.balance ?? null) as BalanceResult | null
  } finally {
    loading.value = false
  }
}

function toNumber(v: number | string | undefined | null): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toMoney(v: number | string | undefined | null): string {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n.toFixed(2) : String(v ?? '0.00')
}

onMounted(loadKeys)
</script>

<template>
  <div class="balance-page">
    <!-- 页头 -->
    <el-card shadow="never" class="page-head-card">
      <h2 class="page-title">余额</h2>
      <p class="page-sub">查看当前余额、消费记录与用量信息</p>
    </el-card>

    <!-- 查询工具条 -->
    <el-card shadow="never">
      <div class="query-toolbar">
        <span class="key-picker-label">
          <el-icon :size="15"><Key /></el-icon>
          密钥选择
        </span>
        <el-select
          v-model="keyId"
          placeholder="选择 API Key"
          clearable
          class="key-select"
        >
          <el-option
            v-for="k in apiKeys"
            :key="k.id"
            :label="`${k.name} (${k.masked})`"
            :value="k.id"
          />
        </el-select>
        <el-button type="primary" :loading="loading" :disabled="!keyId" @click="query">
          <el-icon :size="14" style="margin-right: 4px;"><Refresh /></el-icon>
          查询余额
        </el-button>
      </div>
    </el-card>

    <!-- 无密钥提示 -->
    <el-empty
      v-if="apiKeys.length === 0"
      description="暂无密钥，请到个人中心添加 API Key"
      :image-size="90"
    />

    <!-- 查询结果 -->
    <div v-loading="loading" class="result-wrap">
      <template v-if="result">
        <!-- 状态卡片 -->
        <el-card
          shadow="never"
          class="status-card"
          :class="result.isAvailable ? 'status-card--ok' : 'status-card--low'"
        >
          <div class="status-row">
            <el-icon :size="26" :class="result.isAvailable ? 'status-icon--ok' : 'status-icon--low'">
              <CircleCheck v-if="result.isAvailable" />
              <CircleClose v-else />
            </el-icon>
            <div class="status-text">
              <div class="status-title">
                密钥{{ result.isAvailable ? '正常' : '余额不足' }}
                <el-tag :type="result.isAvailable ? 'success' : 'danger'" size="small" effect="dark">
                  {{ result.isAvailable ? 'NORMAL' : 'LOW' }}
                </el-tag>
              </div>
              <span class="status-sub">
                更新时间：{{ new Date().toLocaleString() }} · 数据正常
              </span>
            </div>
          </div>
        </el-card>

        <!-- 余额明细卡片 -->
        <div class="balance-grid">
          <el-card
            v-for="(b, i) in result.balanceInfos ?? []"
            :key="i"
            shadow="hover"
            class="balance-card"
          >
            <div class="balance-head">
              <el-statistic
                title="当前余额"
                :value="toNumber(b.totalBalance)"
                :precision="2"
              />
              <el-tag size="small" type="info" effect="plain">{{ b.currency || 'CNY' }}</el-tag>
            </div>

            <div class="balance-rows">
              <div class="balance-row">
                <span class="row-left">
                  <el-icon :size="14" style="color: var(--el-color-success);"><Present /></el-icon>
                  赠款余额
                </span>
                <span class="row-val row-val--success">{{ toMoney(b.grantedBalance) }}</span>
              </div>
              <div class="balance-row">
                <span class="row-left">
                  <el-icon :size="14" style="color: var(--el-color-primary);"><CreditCard /></el-icon>
                  充值余额
                </span>
                <span class="row-val row-val--primary">{{ toMoney(b.toppedUpBalance) }}</span>
              </div>
            </div>
          </el-card>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.balance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页头 */
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
}

/* 查询工具条 */
.query-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.key-picker-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  padding: 6px 12px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
  flex-shrink: 0;
}
.key-select {
  width: 360px;
  min-width: 240px;
  flex: 1;
}

.result-wrap {
  min-height: 120px;
}

/* 状态卡片 */
.status-card {
  border-left: 4px solid var(--el-color-success);
}
.status-card--low {
  border-left-color: var(--el-color-danger);
}
.status-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.status-icon--ok {
  color: var(--el-color-success);
}
.status-icon--low {
  color: var(--el-color-danger);
}
.status-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.status-sub {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 余额明细 */
.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.balance-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.balance-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
.row-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.row-val {
  font-weight: 600;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.row-val--success {
  color: var(--el-color-success);
}
.row-val--primary {
  color: var(--el-color-primary);
}

@media (max-width: 720px) {
  .balance-grid {
    grid-template-columns: 1fr;
  }
  .key-select {
    width: 100%;
  }
}
</style>
