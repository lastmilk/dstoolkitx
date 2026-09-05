/**
 * Git 生态端到端验证脚本：
 * 1. 建测试用户（中文用户名 → 设 gitUsername）+ 容器 + GitApiKey
 * 2. git CLI clone 空仓库 → push 合法 JSON → 验证镜像入库
 * 3. push 非法文件/非法 JSON → 验证被拒
 * 4. 制造冲突（两个 client）→ 验证非快进拒绝
 * 5. key 作用域交叉访问 → 403
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const API = 'http://localhost:3000'
const ROOT = '/tmp/dtk-git-test'
const { PrismaClient } = await import('../node_modules/@prisma/client/index.js').then((m) => m) // eslint-disable-line
const crypto = (await import('node:crypto')).default
const prisma = new PrismaClient()

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts })
}
function shAllowFail(cmd, opts = {}) {
  try { return { ok: true, out: sh(cmd, opts) } } catch (e) { return { ok: false, out: (e.stderr || e.stdout || e.message || '').toString() } }
}

let exitCode = 0
function check(name, cond, detail = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : ' — ' + detail.slice(0, 300)}`)
  if (!cond) exitCode = 1
}

try {
  // ── 1. 准备数据 ──
  const user = await prisma.user.upsert({
    where: { username: 'git测试用户' },
    update: { gitUsername: 'git_tester' },
    create: {
      username: 'git测试用户',
      passwordHash: 'x',
      gitUsername: 'git_tester',
    },
  })
  const container = await prisma.deepseekConfig.upsert({
    where: { userId_deepseekUserId: { userId: user.id, deepseekUserId: 'dt_test_1' } },
    update: { name: '测试容器' },
    create: { userId: user.id, name: '测试容器', deepseekUserId: 'dt_test_1' },
  })
  const plainKey = 'dstkg_' + crypto.randomBytes(24).toString('base64url')
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex')
  const globalKey = 'dstkg_' + crypto.randomBytes(24).toString('base64url')
  const globalKeyHash = crypto.createHash('sha256').update(globalKey).digest('hex')
  await prisma.gitApiKey.deleteMany({ where: { userId: user.id } })
  await prisma.gitApiKey.create({ data: { userId: user.id, containerId: container.id, name: 'test', keyHash, prefix: plainKey.slice(0, 11) } })
  await prisma.gitApiKey.create({ data: { userId: user.id, containerId: null, name: 'global', keyHash: globalKeyHash, prefix: globalKey.slice(0, 11) } })

  const repoUrl = `${API}/git/u${user.id}_c${container.id}.git`
  const authUrl = repoUrl.replace('http://', `http://git_tester:${plainKey}@`)
  const globalAuthUrl = repoUrl.replace('http://', `http://git_tester:${globalKey}@`)
  fs.rmSync(ROOT, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  // 幂等：清掉上次残留的远端仓库与队列
  fs.rmSync(`data/git-repos/u${user.id}_c${container.id}.git`, { recursive: true, force: true })
  for (const f of fs.readdirSync('data/mirror-queue')) fs.rmSync(`data/mirror-queue/${f}`, { force: true })
  await prisma.conversation.deleteMany({ where: { configId: container.id } })
  const conf = '-c user.name=git_tester -c user.email=test@dtk.local -c init.defaultBranch=main'

  // ── 2. 首次 push 初始化仓库 + push 合法 JSON ──
  // （远端仓库首次 push 自动创建；此前 clone 会报"未找到"，符合 Git 语义）
  fs.mkdirSync(`${ROOT}/c1`)
  sh(`cd ${ROOT}/c1 && git ${conf} init -b main && git ${conf} remote add origin ${authUrl}`)
  const conv = {
    deepseekConvId: 'conv-001',
    title: '端到端测试对话',
    inserted_at: '2026-09-04T10:00:00Z',
    updated_at: '2026-09-04T10:00:00Z',
    mapping: {
      '1': { id: '1', parent: null, children: ['2'], message: { model: 'deepseek-chat', inserted_at: '2026-09-04T10:00:00Z', fragments: [{ type: 'REQUEST', content: '你好' }] } },
      '2': { id: '2', parent: '1', children: [], message: { model: 'deepseek-chat', inserted_at: '2026-09-04T10:00:05Z', fragments: [{ type: 'RESPONSE', content: '你好！有什么可以帮你？' }] } },
    },
  }
  fs.writeFileSync(`${ROOT}/c1/container.json`, JSON.stringify({ name: '测试容器', deepseekUserId: 'dt_test_1' }))
  fs.mkdirSync(`${ROOT}/c1/conversations`)
  fs.writeFileSync(`${ROOT}/c1/conversations/conv-001.json`, JSON.stringify(conv))
  let r = shAllowFail(`cd ${ROOT}/c1 && git ${conf} add -A && git ${conf} commit -m "init: e2e" && git ${conf} push origin main`)
  check('push 合法对话 JSON', r.ok, r.out)
  await new Promise((s) => setTimeout(s, 7000)) // 等镜像工作器
  const dbConv = await prisma.conversation.findFirst({ where: { configId: container.id, deepseekConvId: 'conv-001' }, include: { messages: true } })
  check('镜像入库 Conversation', !!dbConv, JSON.stringify(dbConv?.deepseekConvId))
  check('镜像入库 Message（2条）', dbConv?.messages.length === 2, `got ${dbConv?.messages.length}`)

  // ── 3. 非法内容被拒 ──
  fs.writeFileSync(`${ROOT}/c1/evil.txt`, 'bad content')
  r = shAllowFail(`cd ${ROOT}/c1 && git ${conf} add evil.txt && git ${conf} commit -m "evil" && git ${conf} push origin main`)
  check('push 非白名单路径被拒', !r.ok, r.out)
  fs.rmSync(`${ROOT}/c1/evil.txt`)

  const badConv = { title: '缺 id' }
  fs.writeFileSync(`${ROOT}/c1/conversations/bad.json`, JSON.stringify(badConv))
  r = shAllowFail(`cd ${ROOT}/c1 && git ${conf} add -A && git ${conf} commit -m "bad" && git ${conf} push origin main`)
  check('push schema 不符 JSON 被拒', !r.ok, r.out)
  fs.rmSync(`${ROOT}/c1/conversations/bad.json`)
  await prisma.$executeRaw`SELECT 1`

  // tag 被拒
  r = shAllowFail(`cd ${ROOT}/c1 && git ${conf} tag v1 && git ${conf} push origin v1`)
  check('push tag 被拒', !r.ok, r.out)

  // ── 4. 冲突：第二 client 在远端领先 → 第一 client push 非快进 ──
  r = shAllowFail(`git ${conf} clone ${authUrl} ${ROOT}/c2`)
  check('clone 已有仓库（第二客户端）', r.ok, r.out)
  const conv2 = { ...conv, deepseekConvId: 'conv-002', title: '第二个对话', mapping: conv.mapping }
  fs.writeFileSync(`${ROOT}/c2/conversations/conv-002.json`, JSON.stringify(conv2))
  sh(`cd ${ROOT}/c2 && git ${conf} add -A && git ${conf} commit -m "add conv2" && git ${conf} push origin main`)
  // c1 未 pull，直接提交并 push → 非快进
  fs.writeFileSync(`${ROOT}/c1/conversations/conv-003.json`, JSON.stringify({ ...conv, deepseekConvId: 'conv-003', title: '第三个对话' }))
  sh(`cd ${ROOT}/c1 && git ${conf} add -A && git ${conf} commit -m "add conv3"`)
  r = shAllowFail(`cd ${ROOT}/c1 && git ${conf} push origin main`)
  check('非快进 push 被拒（冲突检测）', !r.ok, r.out)

  // ── 5. 作用域/归属校验 ──
  const other = await prisma.user.upsert({
    where: { username: 'other-user' },
    update: {},
    create: { username: 'other-user', passwordHash: 'x', gitUsername: 'other_user' },
  })
  const otherContainer = await prisma.deepseekConfig.upsert({
    where: { userId_deepseekUserId: { userId: other.id, deepseekUserId: 'dt_other' } },
    update: {},
    create: { userId: other.id, name: '他人容器', deepseekUserId: 'dt_other' },
  })
  const otherRepoUrl = `${API}/git/u${other.id}_c${otherContainer.id}.git`.replace('http://', `http://git_tester:${plainKey}@`)
  r = shAllowFail(`git ${conf} clone ${otherRepoUrl} ${ROOT}/c3`)
  check('他人仓库用非本人 key → 403/401 拒绝', !r.ok, r.out)

  // 全局 key 可访问
  r = shAllowFail(`git ${conf} clone ${globalAuthUrl} ${ROOT}/c4`)
  check('全局 key clone 本人仓库', r.ok, r.out)

  // 增量更新镜像：c2 修改 conv-002 标题并 push
  fs.writeFileSync(`${ROOT}/c2/conversations/conv-002.json`, JSON.stringify({ ...conv2, title: '第二个对话（增量更新）', updated_at: '2026-09-04T11:00:00Z' }))
  sh(`cd ${ROOT}/c2 && git ${conf} add -A && git ${conf} commit -m "update conv2" && git ${conf} push origin main`)
  await new Promise((s) => setTimeout(s, 7000))
  const dbConv2 = await prisma.conversation.findFirst({ where: { configId: container.id, deepseekConvId: 'conv-002' } })
  check('增量推送后镜像更新标题', dbConv2?.title === '第二个对话（增量更新）', dbConv2?.title ?? 'not found')
} catch (e) {
  console.error('脚本异常', e)
  exitCode = 1
} finally {
  await prisma.$disconnect()
}
process.exit(exitCode)
