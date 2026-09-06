import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/OpenLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('@/views/Dashboard.vue') },
        { path: 'apikeys', name: 'apikeys', component: () => import('@/views/ApiKeys.vue') },
        { path: 'tokens', name: 'tokens', component: () => import('@/views/ApiTokens.vue') },
        { path: 'gitkeys', name: 'gitkeys', component: () => import('@/views/GitKeys.vue') },
        { path: 'oauth', name: 'oauth', component: () => import('@/views/OAuthApps.vue') },
        { path: 'docs', name: 'docs', component: () => import('@/views/ApiDocs.vue') },
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
