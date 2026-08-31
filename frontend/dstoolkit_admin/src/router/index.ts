import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/Dashboard.vue') },
        { path: 'users', name: 'users', component: () => import('@/views/Users.vue') },
        { path: 'configs', name: 'configs', component: () => import('@/views/Configs.vue') },
        { path: 'apikeys', name: 'apikeys', component: () => import('@/views/ApiKeys.vue') },
        { path: 'market', name: 'market', component: () => import('@/views/Market.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.public) return true
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      /* 401 由拦截器处理 */
    }
  }
  if (!auth.isAdmin) {
    auth.logout()
    return { name: 'login' }
  }
  return true
})

export default router
