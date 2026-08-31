import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'dstoolkit',
  description: 'Deepseek 会话查看工具 · RESTful API 文档',
  lang: 'zh-CN',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    siteTitle: 'dstoolkit API',
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API 参考', link: '/api/overview' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '认证与令牌', link: '/guide/authentication' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '总览', link: '/api/overview' },
            { text: '当前用户 /me', link: '/api/me' },
            { text: '配置 /configs', link: '/api/configs' },
            { text: '会话 /conversations', link: '/api/conversations' },
            { text: '搜索 /search', link: '/api/search' },
            { text: '统计 /stats', link: '/api/stats' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com' }],
    footer: {
      message: '基于 MIT 协议发布',
      copyright: 'Copyright © 2026 dstoolkit',
    },
    outline: { level: [2, 3], label: '本页导航' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdatedText: '最后更新',
  },
})
