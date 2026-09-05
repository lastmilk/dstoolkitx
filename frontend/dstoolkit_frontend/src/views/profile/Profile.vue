<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { confirmDanger, success } from '@/utils/sweetalert'
import { request } from '@/utils/request'
import { useAuthStore, type Tier } from '@/stores/auth'
import type { ApiKeyItem, ApiTokenItem, CreatedApiToken, GitApiKeyItem, GitKeysInfo } from '@/types'
import { getGitCred, saveGitCred, clearGitCred, type GitCredential } from '@/utils/gitcred'

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

// ═══════════ API 密钥（GET/POST/DELETE /apikeys）═══════════
const apiKeys = ref<ApiKeyItem[]>([])
const keyName = ref<string>('')
const keyValue = ref<string>('')
const addingKey = ref<boolean>(false)

async function loadApiKeys(): Promise<void> {
  const res: any = await request.get('/apikeys')
  apiKeys.value = (res.apiKeys ?? []) as ApiKeyItem[]
}

async function addKey(): Promise<void> {
  if (!keyName.value || !keyValue.value) {
    ElMessage.error('请填写名称和 Key')
    return
  }
  addingKey.value = true
  try {
    await request.post('/apikeys', { name: keyName.value, key: keyValue.value })
    keyName.value = ''
    keyValue.value = ''
    await loadApiKeys()
    ElMessage.success('密钥已添加')
  } finally {
    addingKey.value = false
  }
}

async function deleteKey(id: number): Promise<void> {
  const ok = await confirmDanger('确认删除此密钥？', '删除后不可恢复')
  if (!ok) return
  await request.delete(`/apikeys/${id}`)
  await loadApiKeys()
  ElMessage.success('密钥已删除')
}

// ═══════════ API 访问令牌（GET/POST/DELETE /tokens）═══════════
const apiTokens = ref<ApiTokenItem[]>([])
const tokenName = ref<string>('')
const tokenExpiry = ref<number>(30)
const tokenCreating = ref<boolean>(false)
const newlyCreated = ref<CreatedApiToken | null>(null)
const showTokenModal = ref<boolean>(false)

const expiryOptions = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '365 天', value: 365 },
  { label: '永久有效', value: 0 },
]

async function loadApiTokens(): Promise<void> {
  const res: any = await request.get('/tokens')
  apiTokens.value = (res.tokens ?? []) as ApiTokenItem[]
}

async function createToken(): Promise<void> {
  if (!tokenName.value.trim()) {
    ElMessage.error('请填写令牌名称')
    return
  }
  tokenCreating.value = true
  try {
    const res: any = await request.post('/tokens', {
      name: tokenName.value.trim(),
      expiresInDays: tokenExpiry.value || undefined,
    })
    newlyCreated.value = res as CreatedApiToken
    showTokenModal.value = true
    tokenName.value = ''
    await loadApiTokens()
    ElMessage.success('API 令牌已生成，请立即保存')
  } finally {
    tokenCreating.value = false
  }
}

async function deleteToken(id: number): Promise<void> {
  const ok = await confirmDanger('确认撤销该令牌？', '撤销后立即失效，不可恢复')
  if (!ok) return
  await request.delete(`/tokens/${id}`)
  await loadApiTokens()
  ElMessage.success('令牌已撤销')
}

async function copyNewToken(): Promise<void> {
  if (!newlyCreated.value) return
  try {
    await navigator.clipboard.writeText(newlyCreated.value.token)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

function tokenExpired(row: ApiTokenItem): boolean {
  return !!row.expiresAt && new Date(row.expiresAt) < new Date()
}

// ═══════════ Git 凭证（GET/POST/DELETE /gitkeys）═══════════
const GIT_USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/

const gitInfo = ref<GitKeysInfo | null>(null)
const gitKeys = ref<GitApiKeyItem[]>([])
const gitContainers = ref<Array<{ id: number; name: string }>>([])
const gitUsernameInput = ref<string>('')
const gitUsernameSaving = ref<boolean>(false)
const savedCred = ref<GitCredential | null>(getGitCred())

const gitKeyDialog = ref<boolean>(false)
const gitKeyName = ref<string>('')
const gitKeyScope = ref<'container' | 'global'>('container')
const gitKeyContainerId = ref<number | null>(null)
const gitKeyExpiry = ref<number>(0)
const gitKeyCreating = ref<boolean>(false)
const gitCreatedKey = ref<GitApiKeyItem | null>(null)
const gitKeySavedToBrowser = ref<boolean>(false)
const showGitKeyModal = ref<boolean>(false)
const gitCloneHost = ref<string>(typeof location !== 'undefined' ? location.host : '')

async function loadGitInfo(): Promise<void> {
  try {
    const res: any = await request.get('/gitkeys')
    gitInfo.value = res as GitKeysInfo
    gitKeys.value = (res.keys ?? []) as GitApiKeyItem[]
    gitUsernameInput.value = res.gitUsername ?? ''
  } catch {
    gitInfo.value = null
  }
  try {
    const c: any = await request.get('/configs')
    gitContainers.value = (c.configs ?? []).map((x: any) => ({ id: x.id, name: x.name }))
  } catch {
    gitContainers.value = []
  }
}

async function saveGitUsername(): Promise<void> {
  const name = gitUsernameInput.value.trim()
  if (!GIT_USERNAME_RE.test(name)) {
    ElMessage.error('Git 用户名只能包含英文、数字、下划线（3-32 位）')
    return
  }
  gitUsernameSaving.value = true
  try {
    await request.post('/gitkeys/username', { gitUsername: name })
    ElMessage.success('Git 推送用户名已设置')
    await loadGitInfo()
  } finally {
    gitUsernameSaving.value = false
  }
}

function openGitKeyDialog(): void {
  gitKeyName.value = ''
  gitKeyScope.value = 'container'
  gitKeyContainerId.value = gitContainers.value[0]?.id ?? null
  gitKeyExpiry.value = 0
  gitCreatedKey.value = null
  gitKeySavedToBrowser.value = false
  gitKeyDialog.value = true
}

async function createGitKey(): Promise<void> {
  if (!gitKeyName.value.trim()) {
    ElMessage.error('请填写名称')
    return
  }
  if (gitKeyScope.value === 'container' && gitKeyContainerId.value == null) {
    ElMessage.error('请选择要授权的对话容器')
    return
  }
  gitKeyCreating.value = true
  try {
    const payload: Record<string, unknown> = {
      name: gitKeyName.value.trim(),
      expiresInDays: gitKeyExpiry.value || undefined,
    }
    if (gitKeyScope.value === 'container') {
      payload.containerId = gitKeyContainerId.value
    } else {
      payload.confirmGlobal = true // 全局 key 安全性略低，需显式确认
    }
    const res: any = await request.post('/gitkeys', payload)
    gitCreatedKey.value = res as GitApiKeyItem
    gitKeyName.value = ''
    gitKeyDialog.value = false
    showGitKeyModal.value = true
    await loadGitInfo()
    ElMessage.success('Git APIKey 已生成，请立即保存')
  } finally {
    gitKeyCreating.value = false
  }
}

async function copyGitKey(): Promise<void> {
  if (!gitCreatedKey.value?.key) return
  try {
    await navigator.clipboard.writeText(gitCreatedKey.value.key)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

function saveCreatedKeyToBrowser(): void {
  if (!gitCreatedKey.value?.key || !gitInfo.value?.gitUsername) return
  saveGitCred({
    gitUsername: gitInfo.value.gitUsername,
    apiKey: gitCreatedKey.value.key,
    keyId: gitCreatedKey.value.id,
    scope: gitCreatedKey.value.scope,
    containerId: gitCreatedKey.value.containerId,
  })
  gitKeySavedToBrowser.value = true
  savedCred.value = getGitCred()
  ElMessage.success('已保存到本浏览器，Git 推送时自动使用')
}

function clearBrowserCred(): void {
  clearGitCred()
  savedCred.value = null
  ElMessage.success('已清除本浏览器保存的 Git 凭证')
}

async function revokeGitKey(id: number): Promise<void> {
  const ok = await confirmDanger('确认撤销该 Git APIKey？', '撤销后立即失效，已配置的客户端将无法再推送/拉取')
  if (!ok) return
  await request.delete(`/gitkeys/${id}`)
  await loadGitInfo()
  ElMessage.success('Git APIKey 已撤销')
}

function gitKeyExpired(row: GitApiKeyItem): boolean {
  return !!row.expiresAt && new Date(row.expiresAt) < new Date()
}

function gitScopeLabel(row: GitApiKeyItem): string {
  if (row.scope === 'global') return '全局（所有容器）'
  return gitContainers.value.find((c) => c.id === row.containerId)?.name ?? `容器 #${row.containerId}`
}

// ═══════════ 邀请奖励（GET /referral/info，POST /referral/bind，POST /referral/links）═══════════
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
  loadApiKeys()
  loadApiTokens()
  loadGitInfo()
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

        <!-- ═══════════ API 密钥 ═══════════ -->
        <el-tab-pane label="API 密钥" name="apikeys">
          <el-alert
            type="info"
            show-icon
            :closable="false"
            class="tab-alert"
            title="添加 API Key 供功能调用，密钥加密存储，列表仅显示掩码"
          />
          <el-form inline @submit.prevent>
            <el-form-item label="名称">
              <el-input v-model="keyName" placeholder="如：工作密钥" class="input-name" />
            </el-form-item>
            <el-form-item label="密钥内容">
              <el-input v-model="keyValue" placeholder="sk-..." class="input-value" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" plain :loading="addingKey" @click="addKey">
                <el-icon :size="14"><Plus /></el-icon>
                添加
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="apiKeys" stripe size="small" style="width: 100%">
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column label="密钥（掩码）" min-width="200">
              <template #default="{ row }">
                <code class="code-text">{{ row.masked }}</code>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="170">
              <template #default="{ row }">
                {{ new Date(row.createdAt).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="danger" plain @click="deleteKey(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ═══════════ API 令牌 ═══════════ -->
        <el-tab-pane label="API 令牌" name="tokens">
          <el-alert
            type="info"
            show-icon
            :closable="false"
            class="tab-alert"
            title="生成访问令牌后，可通过 RESTful API（/api/v1/*）访问数据。明文仅在创建时显示一次，服务端仅存哈希，请立即保存。"
          />
          <el-form inline @submit.prevent>
            <el-form-item label="名称">
              <el-input v-model="tokenName" placeholder="如：脚本采集" class="input-name" />
            </el-form-item>
            <el-form-item label="有效期">
              <el-select v-model="tokenExpiry" class="input-expiry">
                <el-option
                  v-for="opt in expiryOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" plain :loading="tokenCreating" @click="createToken">
                <el-icon :size="14"><Lightning /></el-icon>
                生成令牌
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="apiTokens" stripe size="small" style="width: 100%">
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column label="令牌（掩码）" min-width="180">
              <template #default="{ row }">
                <code class="code-text">{{ row.masked }}</code>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="tokenExpired(row) ? 'danger' : 'success'" size="small">
                  {{ tokenExpired(row) ? '已过期' : '有效' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="170">
              <template #default="{ row }">
                {{ new Date(row.createdAt).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="最后使用" min-width="170">
              <template #default="{ row }">
                {{ row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="过期时间" min-width="170">
              <template #default="{ row }">
                {{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '永久' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="danger" plain @click="deleteToken(row.id)">撤销</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ═══════════ Git 凭证 ═══════════ -->
        <el-tab-pane label="Git 凭证" name="gitkeys">
          <el-alert
            type="info"
            show-icon
            :closable="false"
            class="tab-alert"
            title="Git 推送/拉取使用「Git 用户名 + Git APIKey」进行 Basic 鉴权。任何客户端（Web / Flutter / 标准 Git CLI）推送时都需要：git clone http://<Git用户名>:<dstkg_ APIKey>@host/git/u<userId>_c<containerId>.git"
          />

          <!-- Git 推送用户名 -->
          <h4 class="block-title">Git 推送用户名</h4>
          <el-alert
            v-if="gitInfo?.needsGitUsername"
            type="warning"
            show-icon
            :closable="false"
            class="tab-alert"
            title="你的用户名包含中文：首次生成 Git APIKey 前，必须设置一个英文/数字/下划线组成的 Git 推送用户名"
          />
          <el-form inline @submit.prevent>
            <el-form-item label="用户名">
              <el-input
                v-model="gitUsernameInput"
                :disabled="!!gitInfo?.gitUsername && !gitInfo?.needsGitUsername"
                placeholder="3-32 位：英文、数字、下划线"
                class="input-name"
              />
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                plain
                :loading="gitUsernameSaving"
                :disabled="!!gitInfo?.gitUsername && !gitInfo?.needsGitUsername"
                @click="saveGitUsername"
              >
                保存
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 本浏览器保存的凭证 -->
          <h4 class="block-title">本浏览器凭证</h4>
          <el-descriptions v-if="savedCred" :column="3" border size="small" class="member-desc">
            <el-descriptions-item label="Git 用户名">{{ savedCred.gitUsername }}</el-descriptions-item>
            <el-descriptions-item label="APIKey（掩码）">
              <code class="code-text">{{ savedCred.apiKey.slice(0, 11) }}****</code>
            </el-descriptions-item>
            <el-descriptions-item label="作用域">
              {{ savedCred.scope === 'global' ? '全局' : `容器 #${savedCred.containerId}` }}
            </el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="尚未保存凭证：推送时按引导生成/录入，或创建 Git APIKey 后点「保存到本浏览器」" :image-size="60" />
          <el-button v-if="savedCred" size="small" type="danger" plain style="margin-top: 8px;" @click="clearBrowserCred">
            清除本浏览器凭证
          </el-button>

          <!-- APIKey 列表 -->
          <div class="gitkeys-head">
            <h4 class="block-title">Git APIKey 列表</h4>
            <el-button type="primary" plain size="small" @click="openGitKeyDialog">
              <el-icon :size="14"><Plus /></el-icon>
              生成 Git APIKey
            </el-button>
          </div>
          <el-table :data="gitKeys" stripe size="small" style="width: 100%">
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column label="Key（掩码）" min-width="170">
              <template #default="{ row }">
                <code class="code-text">{{ row.masked }}</code>
              </template>
            </el-table-column>
            <el-table-column label="作用域" min-width="130">
              <template #default="{ row }">{{ gitScopeLabel(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.revokedAt" type="danger" size="small">已撤销</el-tag>
                <el-tag v-else-if="gitKeyExpired(row)" type="warning" size="small">已过期</el-tag>
                <el-tag v-else type="success" size="small">有效</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="最后使用" min-width="160">
              <template #default="{ row }">
                {{ row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="过期时间" min-width="160">
              <template #default="{ row }">
                {{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '永久' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="danger" plain :disabled="!!row.revokedAt" @click="revokeGitKey(row.id)">
                  撤销
                </el-button>
              </template>
            </el-table-column>
          </el-table>
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

    <!-- ═══════════ 令牌明文一次性展示 ═══════════ -->
    <el-dialog
      v-model="showTokenModal"
      title="令牌已生成"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        class="token-alert"
        title="明文令牌仅此一次显示，请立即复制并妥善保存"
        description="关闭后无法再次查看，服务端仅保存哈希；如丢失只能撤销后重新生成新令牌。"
      />
      <div v-if="newlyCreated" class="token-display">
        <div class="token-label">BEARER TOKEN</div>
        <code class="token-code">{{ newlyCreated.token }}</code>
      </div>
      <template #footer>
        <el-button plain @click="showTokenModal = false">
          <el-icon :size="14"><CircleCheck /></el-icon>
          我已保存
        </el-button>
        <el-button type="primary" @click="copyNewToken">
          <el-icon :size="14"><CopyDocument /></el-icon>
          复制令牌
        </el-button>
      </template>
    </el-dialog>

    <!-- ═══════════ 生成 Git APIKey 对话框 ═══════════ -->
    <el-dialog v-model="gitKeyDialog" title="生成 Git APIKey" width="480px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="gitKeyName" placeholder="如：Web 浏览器、Flutter 手机" />
        </el-form-item>
        <el-form-item label="作用域">
          <el-radio-group v-model="gitKeyScope">
            <el-radio value="container">仅单个对话容器（推荐）</el-radio>
            <el-radio value="global">全局（所有容器，安全性略低）</el-radio>
          </el-radio-group>
          <el-select
            v-if="gitKeyScope === 'container'"
            v-model="gitKeyContainerId"
            placeholder="选择对话容器"
            style="width: 100%; margin-top: 8px;"
          >
            <el-option v-for="c in gitContainers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-alert
            v-if="gitKeyScope === 'global'"
            type="warning"
            :closable="false"
            style="margin-top: 8px;"
            title="全局 Key 可访问你名下所有对话容器仓库，泄露时影响面更大，不推荐"
          />
        </el-form-item>
        <el-form-item label="有效期">
          <el-select v-model="gitKeyExpiry" style="width: 100%;">
            <el-option label="7 天" :value="7" />
            <el-option label="30 天" :value="30" />
            <el-option label="90 天" :value="90" />
            <el-option label="365 天" :value="365" />
            <el-option label="永久有效" :value="0" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gitKeyDialog = false">取消</el-button>
        <el-button type="primary" :loading="gitKeyCreating" @click="createGitKey">生成</el-button>
      </template>
    </el-dialog>

    <!-- ═══════════ Git APIKey 明文展示（仅一次） ═══════════ -->
    <el-dialog v-model="showGitKeyModal" title="Git APIKey 已生成" width="520px" :close-on-click-modal="false">
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="明文仅此一次显示，服务端只存哈希。请立即复制保存。"
        style="margin-bottom: 12px;"
      />
      <code class="code-text git-key-plain">{{ gitCreatedKey?.key }}</code>
      <div class="git-key-usage">
        <div class="usage-label">客户端用法（Git 标准 Basic 鉴权）：</div>
        <code class="code-text">
          git clone http://{{ gitInfo?.gitUsername }}:{{ '<APIKey>' }}@{{ gitCloneHost }}/git/u{{ auth.user?.id }}_c{{ '<containerId>' }}.git
        </code>
      </div>
      <template #footer>
        <el-button plain @click="showGitKeyModal = false">
          <el-icon :size="14"><CircleCheck /></el-icon>
          我已保存
        </el-button>
        <el-button :disabled="gitKeySavedToBrowser" @click="saveCreatedKeyToBrowser">
          <el-icon :size="14"><Download /></el-icon>
          {{ gitKeySavedToBrowser ? '已保存到本浏览器' : '保存到本浏览器' }}
        </el-button>
        <el-button type="primary" @click="copyGitKey">
          <el-icon :size="14"><CopyDocument /></el-icon>
          复制 Key
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
