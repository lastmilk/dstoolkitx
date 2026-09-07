<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { success } from '@/utils/sweetalert'
import { request } from '@/utils/request'
import { useAuthStore, type Tier } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const activeTab = ref<string>('account')

// ═══════════ 会员档位展示 ═══════════
const tierMeta: Record<Tier, { label: string; tag: 'info' | 'primary' | 'warning' | 'danger' }> = {
  FREE: { label: '免费版', tag: 'info' },
  PRO: { label: '高级版', tag: 'primary' },
  PLUS: { label: '顶级版', tag: 'warning' },
  ULTIMATE: { label: '超能版', tag: 'danger' },
}

// ═══════════ 退出登录 ═══════════
function handleLogout(): void {
  auth.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

// ═══════════ 修改用户名（PUT /auth/profile）═══════════
const newUsername = ref<string>(auth.user?.username || '')
async function saveUsername(): Promise<void> {
  if (!newUsername.value.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }
  await auth.updateProfile(newUsername.value.trim())
  ElMessage.success('用户信息已更新')
}

// ═══════════ 修改密码（PUT /auth/password）═══════════
const oldPwd = ref<string>('')
const newPwd = ref<string>('')
const confirmPwd = ref<string>('')
async function savePassword(): Promise<void> {
  if (newPwd.value !== confirmPwd.value) {
    ElMessage.error('两次新密码不一致')
    return
  }
  await auth.changePassword(oldPwd.value, newPwd.value)
  ElMessage.success('登录密码已更新')
  oldPwd.value = ''
  newPwd.value = ''
  confirmPwd.value = ''
}

// ═══════════ 云端同步开关（PUT /auth/cloud-sync）═══════════
const cloudSync = ref<boolean>(auth.cloudSyncEnabled)
const cloudSyncLoading = ref<boolean>(false)
async function toggleCloudSync(val: string | number | boolean): Promise<void> {
  cloudSyncLoading.value = true
  try {
    const enabled = await auth.setCloudSync(Boolean(val))
    cloudSync.value = enabled
    success('云端同步已' + (enabled ? '开启' : '关闭'))
  } catch {
    cloudSync.value = auth.cloudSyncEnabled
  } finally {
    cloudSyncLoading.value = false
  }
}

// ═══════════ 跳转开放平台 ═══════════
function goOpenPlatform(): void {
  window.open('/open/', '_blank')
}
interface ReferralLinkItem {
  id: number
  code: string
  clicks: number
  signupCount: number
  totalCommissionEarned: number
  createdAt: string
}
interface ReferralRewardItem {
  id: number
  type: string
  credits: number
  detail: string | null
  createdAt: string
}
interface ReferralInfo {
  referralCode: string
  referralLink: string
  links: ReferralLinkItem[]
  rewards: ReferralRewardItem[]
  stats: { referredCount: number; totalEarned: number; rewardCount: number }
}

const referralLoading = ref<boolean>(true)
const referralInfo = ref<ReferralInfo | null>(null)
const bindCode = ref<string>('')
const binding = ref<boolean>(false)
const generatingLink = ref<boolean>(false)
const copiedField = ref<string | null>(null)

async function loadReferral(): Promise<void> {
  referralLoading.value = true
  try {
    const res: any = await request.get('/referral/info')
    referralInfo.value = res
  } catch {
    referralInfo.value = null
  } finally {
    referralLoading.value = false
  }
}

async function bindReferral(): Promise<void> {
  const code: string = bindCode.value.trim()
  if (!code) {
    ElMessage.error('请输入邀请码')
    return
  }
  binding.value = true
  try {
    const res: any = await request.post('/referral/bind', { code })
    ElMessage.success(res.message || '邀请绑定成功')
    bindCode.value = ''
    await loadReferral()
  } catch {
    /* 失败原因已由请求拦截器统一提示 */
  } finally {
    binding.value = false
  }
}

async function generateLink(): Promise<void> {
  generatingLink.value = true
  try {
    await request.post('/referral/links')
    ElMessage.success('新邀请链接已生成')
    await loadReferral()
  } catch {
    /* 失败原因已由请求拦截器统一提示 */
  } finally {
    generatingLink.value = false
  }
}

async function copyText(text: string, field: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copiedField.value = field
    ElMessage.success('已复制到剪贴板')
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 2000)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

const rewardTypeMap: Record<string, string> = {
  SIGNUP: '邀请注册',
  WELCOME: '受邀奖励',
  FIRST_SUBSCRIBE: '首次订阅',
  PURCHASE: '购买分成',
}

onMounted((): void => {
  loadReferral()
})
</script>

<template>
  <div class="profile-page">
    <!-- ═══════════ 页头身份卡 ═══════════ -->
    <el-card shadow="never" class="page-head-card">
      <div class="head-row">
        <div class="head-left">
          <div class="head-avatar">
            <el-icon :size="26"><User /></el-icon>
          </div>
          <div class="head-info">
            <div class="head-name">{{ auth.user?.username || '未命名用户' }}</div>
            <div class="head-tags">
              <el-tag v-if="auth.isAdmin" type="warning" size="small" effect="dark">管理员</el-tag>
              <el-tag :type="tierMeta[auth.effectiveTier].tag" size="small">
                {{ tierMeta[auth.effectiveTier].label }}
              </el-tag>
              <el-tag :type="auth.cloudSyncEnabled ? 'success' : 'info'" size="small" effect="plain">
                {{ auth.cloudSyncEnabled ? '云端已连接' : '本地模式' }}
              </el-tag>
            </div>
          </div>
        </div>
        <el-button type="danger" plain @click="handleLogout">
          <el-icon :size="14"><SwitchButton /></el-icon>
          退出登录
        </el-button>
      </div>
    </el-card>

    <!-- ═══════════ 开放平台入口 ═══════════ -->
    <el-card shadow="never" class="open-entry-card" @click="goOpenPlatform">
      <div class="open-entry">
        <div class="open-entry-icon">
          <el-icon :size="24"><Odometer /></el-icon>
        </div>
        <div class="open-entry-info">
          <div class="open-entry-title">DSToolKit 开放平台</div>
          <div class="open-entry-desc">
            管理 API 密钥、访问令牌、Git 凭证与 OAuth 应用，通过 RESTful API 或 Git 协议访问你的对话数据
          </div>
        </div>
        <el-button type="primary">
          进入开放平台
          <el-icon :size="14" style="margin-left: 4px;"><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="tabs-card">
      <el-tabs v-model="activeTab">
        <!-- ═══════════ 基本资料 ═══════════ -->
        <el-tab-pane label="基本资料" name="account">
          <h4 class="block-title">会员信息</h4>
          <el-descriptions :column="2" border size="small" class="member-desc">
            <el-descriptions-item label="用户名">
              {{ auth.user?.username || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="会员档位">
              <el-tag :type="tierMeta[auth.effectiveTier].tag" size="small" effect="dark">
                {{ tierMeta[auth.effectiveTier].label }}（{{ auth.effectiveTier }}）
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag :type="auth.isAdmin ? 'warning' : 'info'" size="small" effect="plain">
                {{ auth.isAdmin ? '管理员' : '普通用户' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="云端同步">
              <el-tag :type="auth.cloudSyncEnabled ? 'success' : 'info'" size="small" effect="plain">
                {{ auth.cloudSyncEnabled ? '已开启' : '已关闭' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="注册时间">
              {{ auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleString() : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="升级">
              <el-button type="primary" plain size="small" @click="router.push('/pricing')">
                查看升级方案
              </el-button>
            </el-descriptions-item>
          </el-descriptions>

          <div class="sync-row">
            <div class="sync-info">
              <div class="sync-title">手机号绑定</div>
              <div class="sync-desc">
                <template v-if="auth.user?.phone">已绑定 {{ auth.user.phone }}，云端功能正常可用</template>
                <template v-else-if="auth.needsPhoneForCloud">未绑定：绑定手机号后才能使用云端同步与云端导入</template>
                <template v-else>未绑定：绑定后可用于账号找回与安全验证</template>
              </div>
            </div>
            <el-button
              v-if="!auth.user?.phone"
              :type="auth.needsPhoneForCloud ? 'warning' : 'primary'"
              plain
              size="small"
              @click="router.push('/bind-phone')"
            >
              {{ auth.needsPhoneForCloud ? '去绑定' : '绑定手机号' }}
            </el-button>
          </div>

          <div class="sync-row">
            <div class="sync-info">
              <div class="sync-title">云端同步</div>
              <div class="sync-desc">
                开启后对话数据将同步到云端，可在多设备访问；关闭后仅保存在本地浏览器（IndexedDB）。
              </div>
            </div>
            <el-switch
              :model-value="cloudSync"
              :loading="cloudSyncLoading"
              @change="toggleCloudSync"
            />
          </div>

          <div class="form-grid">
            <div class="form-block">
              <div class="form-block-title">
                <el-icon :size="14" class="title-icon"><EditPen /></el-icon>
                更新用户名
              </div>
              <el-form label-position="top" @submit.prevent>
                <el-form-item label="用户名">
                  <el-input v-model="newUsername" placeholder="请输入用户名" />
                </el-form-item>
                <el-button plain @click="saveUsername">
                  <el-icon :size="14"><Edit /></el-icon>
                  保存
                </el-button>
              </el-form>
            </div>

            <div class="form-block">
              <div class="form-block-title">
                <el-icon :size="14" class="title-icon"><Lock /></el-icon>
                修改登录密码
              </div>
              <el-form label-position="top" @submit.prevent>
                <el-form-item label="原密码">
                  <el-input v-model="oldPwd" type="password" show-password placeholder="请输入原密码" />
                </el-form-item>
                <el-form-item label="新密码">
                  <el-input v-model="newPwd" type="password" show-password placeholder="请输入新密码" />
                </el-form-item>
                <el-form-item label="确认新密码">
                  <el-input v-model="confirmPwd" type="password" show-password placeholder="请再次输入新密码" />
                </el-form-item>
                <el-button plain @click="savePassword">
                  <el-icon :size="14"><Lock /></el-icon>
                  更新密码
                </el-button>
              </el-form>
            </div>
          </div>
        </el-tab-pane>

        <!-- ═══════════ 邀请奖励 ═══════════ -->
        <el-tab-pane label="邀请奖励" name="referral">
          <div v-loading="referralLoading" class="referral-wrap">
            <div class="referral-stats">
              <div class="referral-stat">
                <el-icon :size="18" class="stat-icon stat-icon--primary"><User /></el-icon>
                <div class="referral-stat-num">{{ referralInfo?.stats?.referredCount ?? 0 }}</div>
                <div class="referral-stat-label">邀请人数</div>
              </div>
              <div class="referral-stat">
                <el-icon :size="18" class="stat-icon stat-icon--success"><Wallet /></el-icon>
                <div class="referral-stat-num">{{ referralInfo?.stats?.totalEarned ?? 0 }}</div>
                <div class="referral-stat-label">累计积分</div>
              </div>
              <div class="referral-stat">
                <el-icon :size="18" class="stat-icon stat-icon--warning"><Present /></el-icon>
                <div class="referral-stat-num">{{ referralInfo?.stats?.rewardCount ?? 0 }}</div>
                <div class="referral-stat-label">奖励次数</div>
              </div>
            </div>

            <div class="row-flex">
              <el-input
                :model-value="referralInfo?.referralLink ?? ''"
                readonly
                placeholder="暂无邀请链接"
                class="row-grow"
              />
              <el-button plain @click="copyText(referralInfo?.referralLink ?? '', 'main')">
                <el-icon :size="14"><CopyDocument /></el-icon>
                {{ copiedField === 'main' ? '已复制' : '复制' }}
              </el-button>
              <el-button type="primary" plain :loading="generatingLink" @click="generateLink">
                <el-icon :size="14"><Link /></el-icon>
                生成新链接
              </el-button>
            </div>

            <div class="row-flex">
              <el-input v-model="bindCode" placeholder="输入好友的邀请码" class="row-grow" />
              <el-button plain :loading="binding" @click="bindReferral">
                <el-icon :size="14"><CircleCheck /></el-icon>
                绑定邀请码
              </el-button>
            </div>
            <div class="hint-text">邀请好友注册，双方均可获得 AI 积分奖励；绑定后双方各获 300/500 积分奖励</div>

            <h4 class="block-title table-title">邀请链接</h4>
            <el-table :data="referralInfo?.links ?? []" stripe size="small" style="width: 100%">
              <template #empty>暂无邀请链接，点击上方生成</template>
              <el-table-column label="邀请码" min-width="140">
                <template #default="{ row }">
                  <code class="code-text">{{ row.code }}</code>
                </template>
              </el-table-column>
              <el-table-column prop="clicks" label="点击数" min-width="80" />
              <el-table-column prop="signupCount" label="注册数" min-width="80" />
              <el-table-column prop="totalCommissionEarned" label="累计积分" min-width="100" />
              <el-table-column label="创建时间" min-width="170">
                <template #default="{ row }">
                  {{ new Date(row.createdAt).toLocaleString() }}
                </template>
              </el-table-column>
            </el-table>

            <h4 class="block-title table-title">奖励记录</h4>
            <el-table :data="referralInfo?.rewards ?? []" stripe size="small" style="width: 100%">
              <template #empty>暂无奖励记录</template>
              <el-table-column label="类型" min-width="110">
                <template #default="{ row }">
                  {{ rewardTypeMap[row.type] ?? row.type }}
                </template>
              </el-table-column>
              <el-table-column label="积分" min-width="80">
                <template #default="{ row }">
                  <span class="credit-num">+{{ row.credits }}</span>
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="140">
                <template #default="{ row }">
                  {{ row.detail ?? '—' }}
                </template>
              </el-table-column>
              <el-table-column label="时间" min-width="170">
                <template #default="{ row }">
                  {{ new Date(row.createdAt).toLocaleString() }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

  </div>
</template>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 开放平台入口卡片 */
.open-entry-card {
  border-radius: 12px;
  cursor: pointer;
  background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
  border: 1px solid var(--el-border-color-lighter);
  transition: transform 0.2s, box-shadow 0.2s;
}
.open-entry-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.12);
}
.open-entry {
  display: flex;
  align-items: center;
  gap: 16px;
}
.open-entry-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.open-entry-info {
  flex: 1;
  min-width: 0;
}
.open-entry-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.open-entry-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

/* Git 凭证 */
.gitkeys-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.git-key-plain {
  display: block;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  word-break: break-all;
  font-size: 13px;
}
.git-key-usage {
  margin-top: 12px;
}
.usage-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.git-key-usage .code-text {
  display: block;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  word-break: break-all;
  font-size: 12px;
}

/* 页头身份卡 */
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  flex-shrink: 0;
}
.head-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.head-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 区块标题 */
.block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 12px;
}
.table-title {
  margin-top: 24px;
}

/* 会员信息 */
.member-desc {
  margin-bottom: 20px;
}

/* 云端同步开关 */
.sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 20px;
}
.sync-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}
.sync-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

/* 表单区 */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}
.form-block-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 14px;
}
.title-icon {
  color: var(--el-color-primary);
}

/* 表格与表单通用 */
.tab-alert {
  margin-bottom: 16px;
}
.input-name {
  width: 200px;
}
.input-value {
  width: 320px;
}
.input-expiry {
  width: 160px;
}
.code-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
}

/* 邀请奖励 */
.referral-wrap {
  min-height: 120px;
}
.referral-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}
.referral-stat {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.stat-icon--primary {
  color: var(--el-color-primary);
}
.stat-icon--success {
  color: var(--el-color-success);
}
.stat-icon--warning {
  color: var(--el-color-warning);
}
.referral-stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.referral-stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.row-flex {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.row-grow {
  flex: 1;
}
.hint-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.credit-num {
  color: var(--el-color-success);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 令牌明文弹窗 */
.token-alert {
  margin-bottom: 16px;
}
.token-display {
  padding: 14px 16px;
  background: var(--el-fill-color-dark);
  border-radius: 8px;
  word-break: break-all;
}
.token-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: 0.08em;
}
.token-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.6;
}

@media (max-width: 720px) {
  .referral-stats {
    grid-template-columns: 1fr;
  }
  .row-flex {
    flex-direction: column;
    align-items: stretch;
  }
  .input-name,
  .input-value,
  .input-expiry {
    width: 100%;
  }
}
</style>
