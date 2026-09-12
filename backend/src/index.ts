import express from 'express'
import cors from 'cors'
import compression from 'compression'
import type { ErrorRequestHandler } from 'express'
import { env } from './config/env.js'
import { prisma } from './utils/prisma.js'
import authRoutes from './routes/auth.routes.js'
import configRoutes from './routes/config.routes.js'
import conversationRoutes from './routes/conversation.routes.js'
import apikeyRoutes from './routes/apikey.routes.js'
import balanceRoutes from './routes/balance.routes.js'
import marketRoutes from './routes/market.routes.js'
import timelineRoutes from './routes/timeline.routes.js'
import statsRoutes from './routes/stats.routes.js'
import alpacaRoutes from './routes/alpaca.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import adminRoutes from './routes/admin.routes.js'
import searchRoutes from './routes/search.routes.js'
import chatRoutes from './routes/chat.routes.js'
import tokenRoutes from './routes/token.routes.js'
import v1Routes from './routes/v1.routes.js'
import subscriptionRoutes from './routes/subscription.routes.js'
import summaryRoutes from './routes/summary.routes.js'
import folderRoutes from './routes/folder.routes.js'
import referralRoutes from './routes/referral.routes.js'
import oauth2Routes from './routes/oauth2.routes.js'
import gitRoutes from './routes/git.routes.js'
import gitkeyRoutes from './routes/gitkey.routes.js'
import importRoutes from './routes/import.routes.js'
import continueChatRoutes from './routes/continueChat.routes.js'
import agentRoutes from './routes/agent.routes.js'
import testPaperRoutes from './routes/testPaper.routes.js'
import skillsRoutes from './routes/skills.routes.js'
import mcpRoutes from './routes/mcp.routes.js'
import gitRepoRoutes from './routes/gitRepo.routes.js'
import exportRoutes from './routes/export.routes.js'
import { startMirrorWorker } from './services/gitMirror.js'
import { startTaskQueueWorker } from './services/persistentQueue.js'

const app = express()

app.use(cors({ origin: [env.frontendOrigin, env.adminOrigin, env.openOrigin], credentials: true }))
app.use(compression())  // gzip 压缩：20MB JSON → ~1-2MB，大幅减少传输时间
// Git 智能HTTP：必须在 express.json 之前挂载（原始流透传给 git http-backend）
app.use('/git', gitRoutes)
app.use(express.json({ limit: '50mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/configs', configRoutes)
app.use('/api/conversations', conversationRoutes)
app.use('/api/apikeys', apikeyRoutes)
app.use('/api/balance', balanceRoutes)
app.use('/api/market', marketRoutes)
app.use('/api/timeline', timelineRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/alpaca', alpacaRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/tokens', tokenRoutes)
app.use('/api/gitkeys', gitkeyRoutes)
app.use('/api/v1', v1Routes)
app.use('/api/subscription', subscriptionRoutes)
app.use('/api/summaries', summaryRoutes)
app.use('/api/folders', folderRoutes)
app.use('/api/referral', referralRoutes)
app.use('/api/oauth', oauth2Routes)

// ═══════════ AI 知识库扩展路由 ═══════════
app.use('/api/import', importRoutes)
app.use('/api/continue-chat', continueChatRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/test-papers', testPaperRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/mcp', mcpRoutes)

// ═══════════ Git 仓库（先建后传·拆分存储·任务队列）+ 多样化导出 ═══════════
app.use('/api/git-repos', gitRepoRoutes)
app.use('/api/export', exportRoutes)

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // multer 文件大小错误
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '压缩包过大（>200MB）' })
  }
  console.error('[error]', err?.message || err)
  res.status(err?.status || 500).json({ error: err?.message || '服务器内部错误' })
}
app.use(errorHandler)

async function seed() {
  const count = await prisma.appMarketEntry.count()
  if (count === 0) {
    await prisma.appMarketEntry.createMany({
      data: [
        { name: 'Deepseek 官网', url: 'https://www.deepseek.com', description: 'Deepseek 官方网站', category: 'official' },
        { name: 'Deepseek API 平台', url: 'https://platform.deepseek.com', description: 'Deepseek API 开放平台，可获取 API Key', category: 'official' },
      ],
    })
    console.log('[seed] 已初始化应用市场占位数据')
  }
  // 内置 OAuth2 公共客户端（PKCE，无 secret）
  const mobileClient = await prisma.oAuthClient.findUnique({ where: { clientId: 'dstk-mobile-app' } })
  if (!mobileClient) {
    await prisma.oAuthClient.create({
      data: {
        clientId: 'dstk-mobile-app',
        name: 'DsToolKit Mobile App',
        isPublic: true,
        redirectUris: ['dstoolkit://oauth-callback'],
        scopes: ['read:conversations', 'search', 'profile', 'offline_access'],
      },
    })
    console.log('[seed] 已创建 OAuth 客户端 dstk-mobile-app')
  }
}

const server = app.listen(env.port, async () => {
  console.log(`[dstoolkit] backend running on http://localhost:${env.port}`)
  startMirrorWorker() // Git 推送 → MySQL 镜像队列消费
  startTaskQueueWorker() // 持久化任务队列（断电续传）
  console.log('[dstoolkit] git smart-http at /git/u<uid>_c<cid>.git')
  console.log('[dstoolkit] git repos (split storage) at /api/git-repos')
  if (env.meiliEnabled) {
    console.log(`[dstoolkit] Meilisearch enabled at ${env.meiliHost}`)
  } else {
    console.log('[dstoolkit] Meilisearch disabled (MEILISEARCH_HOST empty) - cloud_v1 search will gracefully degrade)')
  }
  try {
    await seed()
  } catch (e) {
    console.error('[seed] 失败', e)
  }
})

async function shutdown() {
  console.log('\n[dstoolkit] closing...')
  await prisma.$disconnect()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export { app, server }
