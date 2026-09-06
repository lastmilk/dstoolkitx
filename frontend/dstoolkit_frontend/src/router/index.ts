import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => {
        const auth = useAuthStore()
        if (auth.isLoggedIn) {
          return '/configs'
        }
        return '/portal'
      },
    },
    {
      path: '/portal',
      name: 'portal',
      component: () => import('@/portal/layouts/PortalLayout.vue'),
      meta: { public: true },
      children: [
        { path: '', name: 'portal-home', component: () => import('@/portal/pages/Home.vue') },
        { path: 'features', name: 'portal-features', component: () => import('@/portal/pages/Features.vue') },
        { path: 'pricing', name: 'portal-pricing', component: () => import('@/portal/pages/Pricing.vue') },
        { path: 'agreement', name: 'portal-agreement', component: () => import('@/portal/pages/Agreement.vue') },
        { path: 'privacy', name: 'portal-privacy', component: () => import('@/portal/pages/Privacy.vue') },
      ],
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/auth/Register.vue'),
      meta: { public: true },
    },
    {
      path: '/oauth/authorize',
      name: 'oauth-authorize',
      component: () => import('@/views/oauth/Authorize.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      children: [
        { path: 'configs', name: 'configs', component: () => import('@/views/config/Configs.vue') },
        { path: 'explore', name: 'explore', component: () => import('@/views/explore/Explore.vue') },
        { path: 'search', redirect: '/explore' },
        { path: 'timeline', redirect: '/explore' },
        { path: 'stats', name: 'stats', component: () => import('@/views/stats/Stats.vue') },
        { path: 'alpaca', name: 'alpaca', component: () => import('@/views/alpaca/Alpaca.vue') },
        { path: 'balance', name: 'balance', component: () => import('@/views/balance/Balance.vue') },
        { path: 'pricing', name: 'pricing', component: () => import('@/views/pricing/Pricing.vue') },
        { path: 'market', name: 'market', component: () => import('@/views/market/Market.vue') },
        { path: 'profile', name: 'profile', component: () => import('@/views/profile/Profile.vue') },
        { path: 'bind-phone', name: 'bind-phone', component: () => import('@/views/auth/BindPhone.vue') },
        // ═══════════ AI 知识库扩展 ═══════════
        { path: 'import', name: 'import', component: () => import('@/views/ai/Import.vue') },
        { path: 'continue-chat', name: 'continue-chat', component: () => import('@/views/ai/ContinueChat.vue') },
        { path: 'agent', name: 'agent', component: () => import('@/views/ai/AgentChat.vue') },
        { path: 'test-paper', name: 'test-paper', component: () => import('@/views/ai/TestPaper.vue') },
        { path: 'agent-tools', name: 'agent-tools', component: () => import('@/views/ai/AgentTools.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.public) return true
  if (!auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      /* 401 已由 axios 拦截器处理跳转 */
    }
  }
  return true
})

export default router
