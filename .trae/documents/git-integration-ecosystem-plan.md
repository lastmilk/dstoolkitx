# 基于 Git 的一体化对话生态 — 实施计划

## 概要

将 dstoolkit 升级为"基于 Git 的一体化功能生态"：后端实现**标准 Git 智能HTTP服务**（git http-backend + 钩子校验），任何标准 Git 客户端（git CLI / isomorphic-git / git2dart）均可接入。Web 端引入 isomorphic-git、Flutter 端引入 git2dart，"账号配置"升级为"对话容器"（每容器 = 一个 Git 仓库），原有整体导入操作全部改为 Git 增量提交/推送，支持对话级冲突处理（三选一），Git 推送统一走 用户名 + APIKey 鉴权，远端仓库仅接受特定格式的对话 JSON。

**已确认决策**：① 标准 Git 智能HTTP服务（非 PRD 草案的类 Git 私有协议）；② Git 仓库为主，推送成功后自动镜像进现有 Conversation/Message 表（搜索/统计/分享不受影响）；③ 冲突处理采用对话文件级三选一（保留本地 / 保留远端 / 按 turn 智能合并）。

## 现状分析

- 后端 `backend/`（Express + Prisma/MySQL，pnpm）：**无任何 Git 相关代码**。`output/PRD.md` L898-995 有类 Git 协议草案（SyncCommit/SyncHead），本次决策不采用其私有协议，仅借鉴其对话路径与冲突语义。
- 鉴权现状：`ApiToken`（`dstk_`，SHA-256 存储，`verifyApiToken` 中间件）供程序化 API 使用；`ApiKey` 模型是用户自己的 Deepseek 密钥（AES 加密），两者均不适用 Git 鉴权，需新建 `GitApiKey`。
- `User.username` 唯一但无 ASCII 约束（可含中文），无 gitUsername 字段。
- Web "账号配置" = [Configs.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/config/Configs.vue)：上传 Deepseek zip → `POST /configs` 服务端解析后整体写入 DB（或 IndexedDB 本地模式）；对话卡片在 [Explore.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/explore/Explore.vue) 等视图展示。
- Flutter：`lib/data/api/v1_api.dart` 调 `/api/v1/configs`；无 Git 能力。
- 环境已验证：本机 git 2.55.0；`backend/node_modules/.bin/tsx` 可用；数据库为远程 MySQL（`backend/.env` DATABASE_URL，**保持不变**）。
- Conversation 表：`(configId, deepseekConvId)` 唯一，rawMapping Json + Message 子表 —— 镜像目标。

## 架构设计

```
Web(isomorphic-git)──┐
Flutter(git2dart)────┼── Basic Auth(username=GitUsername, password=dstkg_xxx)──►
git CLI(任意第三方)──┘        GET/POST /git/u<uid>_c<cid>.git/*
                                              │
                        Express: git.routes.ts ── spawn `git http-backend`
                                              │        GIT_PROJECT_ROOT=backend/data/git-repos
                            pre-receive 钩子 ─┤        core.hooksPath=backend/git-hooks
                            (仅允许 conversations/*.json + container.json,
                             校验对话 JSON schema，违规 reject)
                                              │
                            post-receive 钩子 ─► 追加 old new ref 到镜像队列文件
                                              │
                        gitMirror.ts 工作器(setInterval+响应后触发) ─► diff --name-status
                                              │        → git show 取新 JSON → upsert Conversation/Message
                                              ▼
                                     现有 MySQL（搜索/统计/分享继续可用）
```

- 仓库命名 `u<userId>_c<containerId>.git`（bare，main 分支）：路径自证归属，鉴权中间件据此校验 key 的作用域。
- 对话容器复用 `DeepseekConfig` 实体（UI 改名"对话容器"），仓库在首次 push 时自动 `git init --bare`。
- 统一 JSON 规范（requirement 5）：
  - 允许路径白名单：`container.json`（容器元信息 `{name, deepseekUserId}`）、`conversations/<deepseekConvId>.json`。
  - 对话文件 schema：`deepseekConvId`(string，须等于文件名)、`title`(string)、`mapping`(object) 或 `messages`(array) 至少其一；blob mode 仅允许 100644；单文件 ≤ 2MB，单次推送新增总量 ≤ 50MB；仅允许更新 `refs/heads/*`，拒绝 tag/删除分支。
  - 违规 → pre-receive 退出非 0，客户端收到 `[remote rejected] <原因>`。

## 实施步骤

### Phase 1 数据模型与 Git APIKey 鉴权（requirement 4）

1. `backend/prisma/schema.prisma`
   - `User` 增加 `gitUsername String? @unique`。
   - 新增 `GitApiKey`：`id, userId, containerId Int?（null=全局）, name, keyHash @unique, prefix, lastUsedAt, expiresAt?, revokedAt?, createdAt` + User/DeepseekConfig 关系；`prisma:push`（按项目惯例，pnpm 构建问题用 `node node_modules/prisma/build/index.js push` 绕过）。
2. 新建 `backend/src/utils/gitapikey.ts`：仿 `apitoken.ts` — 生成 `dstkg_` + 32 字节 base62，SHA-256 入库，明文仅创建时返回一次。
3. 新建 `backend/src/routes/gitkey.routes.ts`（JWT 鉴权，挂载 `/api/gitkeys`）：
   - `GET /` 列表（掩码+作用域+lastUsedAt）；`POST /`（body: name, containerId?；若 username 含非 ASCII 且未设 gitUsername → 400 `{code:'GIT_USERNAME_REQUIRED'}`；创建全局 key 需 body `confirmGlobal:true`）；`DELETE /:id`（软撤销）；`POST /username` 设置 gitUsername（`^[a-zA-Z0-9_]{3,32}$`，冲突检测）。
4. 新建 `backend/src/services/gitAuth.ts`：Basic Auth 校验（供 Phase 2 使用）— base64 解码 → 用户名须等于该 key 所属用户的 gitUsername（未设置且 ASCII 时可用 username）→ SHA-256 查 key → 校验 revoked/expired → 作用域：全局 key 可访问该用户全部仓库，容器 key 仅限 `containerId` 匹配的仓库。

### Phase 2 Git 智能HTTP服务 + JSON 校验（requirement 1/5 服务端）

5. 新建 `backend/src/routes/git.routes.ts`（挂载 `/git`，**必须在 express.json 之前**注册以透传原始流；手写 CORS：放行 `https://dstoolkit.cn` 与 `http://localhost:5174`，允许 Authorization 头，OPTIONS→204）：
   - 路由 `/git/:repo/*`：`gitAuth` 中间件 → 仓库不存在时 `git init --bare -b main` + `git config core.hooksPath <abs>/backend/git-hooks` → spawn `git http-backend`（env: `GIT_PROJECT_ROOT=backend/data/git-repos`、`GIT_HTTP_EXPORT_ALL=1`、`PATH_INFO=/repo/*`、`REMOTE_USER`、CONTENT_*），req↔stdin、stdout↔res 双向管道；仓库前缀 `u<uid>_` 与鉴权用户不符 → 403。响应 `finish` 且为 receive-pack 成功时触发镜像工作器（Phase 3）。
6. 新建 `backend/git-hooks/pre-receive`（bash，调 node 校验器）与 `backend/scripts/validate-push.mjs`（自包含，不 import TS）：
   - stdin 逐行 `old new ref`：非 `refs/heads/` → 拒绝；删除分支 → 拒绝。
   - `git rev-list --objects old..new` + `git cat-file --batch-check` 枚举新增 blob：路径不在白名单 → 拒绝；mode 非 100644 → 拒绝；大小超限 → 拒绝。
   - 每个 blob：JSON.parse + 对话 schema 校验（convId==文件名等）→ 全部通过才放行，否则 stderr 输出具体原因并 exit 1。
7. 新建 `backend/git-hooks/post-receive`：将 `old new ref` 追加到 `backend/data/mirror-queue/<repo>.jsonl`（队列文件）。
8. `backend/src/index.ts` 挂载 `/git` 与 `/api/gitkeys`。
9. `backend/src/routes/config.routes.ts`：
   - 新增 `GET /api/configs/:id/git-info`（JWT）→ `{ repoUrl, gitUsername, hasKey }`（供双端构造 clone 地址）。
   - 上传解析端点增加 `mode=parse-only`：只解析 zip 返回 `{config, conversations}` 不写 DB（对话入库改由镜像完成，避免双写）。

### Phase 3 镜像服务（已确认决策②）

10. 重构 `backend/src/routes/config.routes.ts` 中"解析后写库"逻辑为 `backend/src/services/conversationStore.ts`（upsertConversation(rawMapping→Conversation+Message 重建)），原导入路径与镜像共用。
11. 新建 `backend/src/services/gitMirror.ts`：队列工作器（setInterval 5s + git 响应 finish 后手动 kick）— 逐行读取队列 → `git diff --name-status old new` → A/M: `git show new:path` 入库；D: 删除行；`container.json` 变更则同步 DeepseekConfig 元信息 → 成功后截断已处理行；失败保留待重试（幂等 upsert 保证安全）。

### Phase 4 Web 端（requirement 1/2/3 Web 侧）

12. `frontend/dstoolkit_frontend/package.json`：+ `isomorphic-git`、`@isomorphic-git/lightning-fs`。
13. 新建 `src/utils/gitcred.ts`：localStorage 凭证存储 `gitcred_<containerId|global>` `{gitUsername, key}`，Web 端创建 key 后由用户选择"记住到本机"。
14. 新建 `src/utils/gitclient.ts`（isomorphic-git + LightningFS，工作目录 `/dtk/<uid>/<cid>`）：
    - `ensureReady(container)`：无本地仓库则 `git.clone`（main 单分支）；
    - `commitFiles(container, files)`：写文件→`git.add`→`git.commit`（author= gitUsername）；
    - `push(container)`：`git.push` onAuth 注入凭证；捕获非快进异常 → 返回冲突标记；
    - `analyzeConflict(container)`：fetch 后 `git.log` 双向找 merge-base，列出本地/远端各自变更文件；
    - `mergeConversations(container, base, local, remote)`：非冲突文件自动取并集；冲突对话按 mapping 节点 id 三方合并（仅本地有→保留，仅远端有→保留，双方都有且不同→取 `inserted_at` 新者），产出 merge commit（parent: [local, remote]）后推送。
15. [Configs.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/config/Configs.vue) — "账号配置"→"对话容器"：
    - 文案全部替换（标题/工具条/按钮/空态），沿用 new拟态 风格与 sweetalert 弹窗。
    - 新增容器：`POST /api/configs`（容器壳）→ zip 上传 `mode=parse-only` → gitclient 初始提交（`init: import N conversations`）→ push；本地 IndexedDB 仍保存工作副本（现有 saveLocalConfig 不动）。
    - 更新容器：parse-only 对比本地 HEAD → 仅变更文件提交（`update: N conversations`）→ push。
    - 删除容器：现有删除 + 请求后端顺带删仓库目录。
16. "增量"按钮（requirement 2）：在 [Explore.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/explore/Explore.vue) 对话卡片操作区与 Configs 容器详情对话列表处新增 SVG 图标按钮"增量"（遵循用户偏好：SVG 图标、无渐变、EP 变量色）→ 当前 IndexedDB 中的对话 JSON → gitclient commit+push → ElMessage 反馈 commit 短 hash；未配置凭证时引导至 Profile。
17. 冲突处理 UI（requirement 3）：push 被拒（非快进）→ 新建 `src/components/GitConflictDialog.vue` 列出冲突对话文件，三选一：
    - 保留本地：`git.push({force:true})`（confirmDanger 二次确认）；
    - 保留远端：本地 reset 到远端（confirmDanger）；
    - 智能合并：执行 mergeConversations 后正常 push，展示合并结果摘要。
18. [Profile.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/profile/Profile.vue)：新增"Git 凭证"区（API 密钥 Tab 旁新 Tab）：key 列表/创建（选择容器作用域或全局+红字警示）/撤销；`GIT_USERNAME_REQUIRED` 时弹 gitUsername 设置对话框。
19. `vite.config.ts`：proxy 增加 `'/git': 'http://localhost:3000'`。

### Phase 5 Flutter 端（requirement 1/3/4 移动侧）

20. `flutter_app/pubspec.yaml`：+ `git2dart`、`git2dart_binaries`（libgit2 预编译，支持 HTTP + UsernamePassword 凭证）。
21. `lib/data/api/v1_api.dart`：+ createGitKey / deleteGitKey / setGitUsername / getGitInfo。
22. `lib/data/models/models.dart`：+ GitApiKey 模型。
23. 新建 `lib/data/git/git_repo_service.dart`：clone/fetch/commit/push（仓库目录 `<appDocs>/git/<cid>`，凭证 UsernamePassword(gitUsername, apiKey)）；`push` 非 FF 时抛 GitConflictException。
24. 新建 `lib/data/git/merge_service.dart`：与 Web 相同的三方合并语义（节点 id 并集 + inserted_at 取新）。
25. UI 接入：
    - [profile_page.dart](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/lib/features/profile/profile_page.dart)：Git 凭证管理页（key 列表/创建/撤销 + gitUsername 首次设置对话框，中文用户名强制引导）。
    - `conversation_list_page.dart` 对话卡片：长按/操作区新增"增量同步"→ commit 当前对话 JSON + push；冲突弹三选一对话框（保留本地/保留远端/智能合并，新拟态风格）。
    - `app_router.dart` 注册新页面。

### 收尾

26. 全链路联调 + 验证（见下）；将"双端 Git 生态接入要点"（JSON 规范、鉴权方式、repo 地址规则）整理进 `backend/src/routes/git.routes.ts` 顶部注释块，方便第三方接入者阅读（不新建文档文件）。

## 假设与决策记录

- **标准 Git 协议**（用户确认）：第三方用任意 Git 客户端即可接入；PRD 的 SyncCommit/SyncHead 私有协议不实施。
- **镜像 DB**（用户确认）：Git 仓库为容器数据主源，推送后镜像 Conversation/Message，现有搜索/统计/分享零改动。
- **冲突三选一**（用户确认）：文件级；智能合并 = 节点 id 三方并集、inserted_at 取新。
- 全局 APIKey 复用新建 GitApiKey 的 `containerId=null` 形态，不复用现有 `dstk_` ApiToken（避免权限混淆，全局 key 需显式 confirm）。
- 浏览器端凭证存 localStorage（与现有 JWT 存储同级风险），UI 明示；服务端可随时撤销。
- 生产服务器需确认 git 已安装（宝塔 Node 环境，实施时验证）；本机已验证 git 2.55.0。
- 数据库连接串不变（用户要求）；`.env` 仅追加 `GIT_REPO_ROOT`、`GIT_HOOKS_PATH`（有默认值，可选）。

## 验证

1. **后端**：`cd backend && node node_modules/typescript/bin/tsc --noEmit` 零错误；启动 tsx 后：
   - `curl -u <gitUsername>:<key> http://localhost:3000/git/u1_c1.git/info/refs?service=git-upload-pack` 返回 smart 协议头；
   - git CLI 实测：clone 空仓库 → 提交合法 `conversations/x.json` push 成功 → DB 出现 Conversation/Message 镜像行；
   - push 一个 `evil.txt` 与一个 schema 不符 JSON → 均被 `[remote rejected]` 且 DB 无变化；
   - 全局/容器 key 交叉访问他人仓库 → 403。
2. **Web**：`npm run build`（含 vue-tsc）零错误；浏览器冒烟：新建容器→推送→增量按钮→第二客户端制造冲突→三选一各走通；控制台无错误。
3. **Flutter**：`flutter analyze` 零问题；模拟器实测 clone/增量/冲突流程。
