/**
 * Git 智能HTTP服务（/git/*）—— DsToolKit Git 一体化生态入口
 *
 * ═══════════════ 第三方接入要点（任意标准 Git 客户端可用）═══════════════
 *
 * 1. 仓库地址：  {API_ORIGIN}/git/u<userId>_c<containerId>.git
 *    （一个"对话容器"= 一个 bare 仓库，首次 push 自动创建，默认分支 main）
 *
 * 2. 鉴权（push/pull 统一）：HTTP Basic Auth
 *    · 内置客户端（Web 端 / APP 端）：Basic 密码 = 登录会话凭证（Web 用 JWT、
 *      APP 用 dstk_ 访问令牌），自动携带，无需任何 Git 凭证设置；
 *    · 外部 Git 客户端：username = Git 推送用户名（个人中心设置；username 含
 *      中文用户首次生成 Git APIKey 时必须先设置，仅限英文+数字+下划线 3-32 位），
 *      password = Git APIKey（dstkg_ 前缀，个人中心创建；可绑定单个容器或全局）
 *
 * 3. 仓库内容白名单（pre-receive 钩子强制校验，违规推送被拒绝）：
 *      container.json              —— 容器元信息 {"name","deepseekUserId"}
 *      conversations/<id>.json     —— 对话 JSON：
 *        { "deepseekConvId": "<必须等于文件名>", "title": string,
 *          "mapping": object | "messages": array, ... }
 *    仅允许 refs/heads/* 普通分支更新；拒绝 tag、分支删除、二进制与其它任何文件。
 *
 * 4. 推送成功后服务端自动把对话 JSON 镜像进 MySQL（搜索/统计/分享继续可用）。
 *
 * 快速上手（git CLI）：
 *    git clone http://<GitUsername>:<dstkg_xxx>@api.dstoolkit.cn/git/u1_c2.git
 *    echo '{"deepseekConvId":"a","title":"t","messages":[]}' > conversations/a.json
 *    git add . && git commit -m "add a" && git push
 * ═════════════════════════════════════════════════════════════════════════
 */
import { Router } from 'express'
import { spawn, execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prisma } from '../utils/prisma.js'
import { gitBasicAuth, parseRepoName } from '../services/gitAuth.js'
import { kickMirror } from '../services/gitMirror.js'

const router = Router()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// <backend>/src/routes → <backend>
const BACKEND_ROOT = path.resolve(__dirname, '..', '..')
const REPO_ROOT = process.env.GIT_REPO_ROOT || path.join(BACKEND_ROOT, 'data', 'git-repos')
const HOOKS_PATH = process.env.GIT_HOOKS_PATH || path.join(BACKEND_ROOT, 'git-hooks')

/** 确保目录存在；仓库不存在时自动 init bare（main 分支 + 共享钩子） */
async function ensureRepo(repoFsName: string): Promise<string> {
  const repoPath = path.join(REPO_ROOT, repoFsName)
  if (!fs.existsSync(path.join(repoPath, 'HEAD'))) {
    fs.mkdirSync(REPO_ROOT, { recursive: true })
    await new Promise<void>((resolve, reject) => {
      execFile('git', ['init', '--bare', '-b', 'main', repoPath], (err) => (err ? reject(err) : resolve()))
    })
    await new Promise<void>((resolve, reject) => {
      execFile('git', ['config', 'core.hooksPath', HOOKS_PATH], { cwd: repoPath }, (err) => (err ? reject(err) : resolve()))
    })
  }
  return repoPath
}

/** CGI（git http-backend）响应解析：Status 头 + 头块 + body 流式回写 */
function pipeCgiToRes(cgiStdout: NodeJS.ReadableStream, res: import('express').Response) {
  let buf = Buffer.alloc(0)
  let headersDone = false
  cgiStdout.on('data', (chunk: Buffer) => {
    if (headersDone) {
      res.write(chunk)
      return
    }
    buf = Buffer.concat([buf, chunk])
    const idx = buf.indexOf('\r\n\r\n')
    if (idx === -1) return
    headersDone = true
    const headerText = buf.subarray(0, idx).toString('utf8')
    let status = 200
    for (const line of headerText.split('\r\n')) {
      const ci = line.indexOf(':')
      if (ci < 0) continue
      const k = line.slice(0, ci).trim().toLowerCase()
      const v = line.slice(ci + 1).trim()
      if (k === 'status') status = Number.parseInt(v, 10) || 200
      else res.setHeader(k, v)
    }
    res.status(status)
    const rest = buf.subarray(idx + 4)
    if (rest.length > 0) res.write(rest)
  })
  cgiStdout.on('end', () => {
    if (!headersDone) res.status(502).end('git http-backend: empty response')
    else res.end()
  })
}

router.all('/:repo/*', async (req, res) => {
  console.log(`[git-debug] ${req.method} ${req.originalUrl} auth=${req.headers.authorization ? `present(${req.headers.authorization.slice(0, 24)}...)` : 'absent'}`)
  const repoName = String(req.params.repo || '')
  // req.path 形如 /u1_c2.git/info/refs（不含 query），取仓库段之后的部分
  const subPath = req.path.split('/').slice(2).join('/')
  const repoRef = parseRepoName(repoName)
  if (!repoRef) return res.status(404).json({ error: '仓库地址不合法：应为 /git/u<userId>_c<containerId>.git/*' })

  const auth = await gitBasicAuth(req, repoRef)
  if (!auth.ok) {
    // 仅当请求完全未携带凭证时才下发 Basic 挑战（第三方 Git 客户端首次探测依赖它
    // 弹出凭证输入）；已带凭证的内置客户端（会话令牌）失败时回裸 JSON，避免浏览器
    // 对 401+WWW-Authenticate 弹原生认证框。
    if (!req.headers.authorization) {
      res.setHeader('WWW-Authenticate', 'Basic realm="DsToolKit Git", charset="UTF-8"')
    }
    return res.status(auth.status).json({ error: auth.message })
  }

  // 容器必须真实存在（防止任意路径建仓库）
  const container = await prisma.deepseekConfig.findFirst({
    where: { id: repoRef.containerId, userId: repoRef.userId },
    select: { id: true },
  })
  if (!container) return res.status(404).json({ error: '对话容器不存在' })

  const isReceive =
    req.method === 'POST' && subPath === 'git-receive-pack'
  const service = String(req.query.service || '')
  const wantsReceive = isReceive || service === 'git-receive-pack'

  let repoPath: string
  try {
    if (wantsReceive) {
      repoPath = await ensureRepo(repoName)
    } else {
      repoPath = path.join(REPO_ROOT, repoName)
      if (!fs.existsSync(path.join(repoPath, 'HEAD'))) {
        return res.status(404).json({ error: '仓库不存在（先 push 初始化）' })
      }
    }
  } catch (e: any) {
    console.error('[git] init repo failed', e?.message)
    return res.status(500).json({ error: '仓库初始化失败' })
  }

  // spawn git http-backend（CGI），原始 body 双向透传
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_PROJECT_ROOT: REPO_ROOT,
    GIT_HTTP_EXPORT_ALL: '1',
    PATH_INFO: `/${repoName}/${subPath}`,
    REQUEST_METHOD: req.method,
    QUERY_STRING: new URL(req.url, 'http://x').search.replace(/^\?/, ''),
    CONTENT_TYPE: String(req.headers['content-type'] || ''),
    GATEWAY_INTERFACE: 'CGI/1.1',
    SERVER_PROTOCOL: 'HTTP/1.1',
    SERVER_NAME: 'dstoolkit',
    SERVER_PORT: '443',
    REMOTE_USER: auth.auth.username,
    REMOTE_ADDR: req.ip || '',
    GIT_PROTOCOL: String(req.headers['git-protocol'] || ''),
  }
  const contentLength = req.headers['content-length']
  if (contentLength) env.CONTENT_LENGTH = String(contentLength)
  if (req.headers['transfer-encoding']) env.HTTP_TRANSFER_ENCODING = String(req.headers['transfer-encoding'])

  const cgi = spawn('git', ['http-backend'], { env })
  cgi.on('error', (e) => {
    console.error('[git] spawn http-backend failed（检查服务器是否安装 git）', e.message)
    if (!res.headersSent) res.status(500).json({ error: 'Git 服务不可用' })
    res.end()
  })
  cgi.stderr.on('data', (d) => console.error('[git-http-backend]', d.toString().trim()))

  pipeCgiToRes(cgi.stdout, res)
  req.pipe(cgi.stdin)
  cgi.on('close', (code) => {
    if (!res.writableEnded) res.end()
    // 推送成功（post-receive 已入队）→ 立即触发镜像
    if (wantsReceive && code === 0) kickMirror(repoRef)
  })
})

export default router
