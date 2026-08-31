# DsToolKit Flutter 移动端 & 浏览器插件 开发方案

> 版本：v1.0 · 日期：2026-08-23 · 状态：技术方案稿

***

## 0. 执行摘要 Executive Summary

本方案在现有 DsToolKit 后端（Node.js/Express + Prisma/MySQL）和前端（Vue3 + NaiveUI）体系基础上，新增两大客户端渠道：

| 模块                           | 定位                              | 核心价值                                                | 付费门槛                                   |
| ---------------------------- | ------------------------------- | --------------------------------------------------- | -------------------------------------- |
| **Flutter App**              | 移动端原生体验（iOS/Android）            | 随身查看对话、离线缓存、移动端适配组件、推送通知                            | FREE 可用基础功能；PLUS+ 解锁云同步/搜索/导出          |
| **DsToolKit（MV3 插件）**        | Chrome/Edge 浏览器扩展               | 无感捕获 DeepSeek 官网对话，通过 Git 差分同步至后端；独立管理 API 令牌与连接状态  | **必须创建 RESTful API 令牌**（需要 PLUS 及以上等级） |
| **DsToolKit Extended（油猴脚本）** | Tampermonkey/Violentmonkey 用户脚本 | 深度注入 DeepSeek 页面 DOM，拦截真实对话数据流；将数据发送给 DsToolKit 插件侧 | 配合插件使用，无独立付费要求；但**依赖插件持有 API 令牌**      |

三者通过 **OAuth2.0 授权码流程 + RESTful API（Bearer dstk\_ Token）** 与后端通信。浏览器插件的"Git 同步"采用 **类 Git commit 哈希 + 增量差分（diff-match-patch）** 的轻量协议实现，每次对话结束无感提交。

**商业闭环**：创建 API 令牌 ➜ 需要 PLUS/ULTIMATE 等级 ➜ 付费（卡密/年付/永久）➜ 解锁浏览器插件 ➜ 同步数据产生黏性 ➜ 反哺 Flutter App 使用率。

***

## 1. 系统总架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DsToolKit 生态                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐   OAuth2 Code Flow     ┌──────────────────────────┐     │
│   │  Flutter App │◄──────────────────────►│  Backend (现有的 Node.js) │     │
│   │  (iOS/Android)│   JWT Access Token     │  Express + Prisma + MySQL│     │
│   └──────┬───────┘   Bearer dstk_...       └──────────┬───────────────┘     │
│          │                                            │                     │
│          │  REST API /api/v1/*                        │ /api/* (Web UI)     │
│          │  + 离线 SQLite Cache                       │ /api/v1/* (API)     │
│          │  + Git-style Pull Data                     │ /api/oauth/* (OAuth)│
│          │                                            │                     │
│          │                              ┌─────────────▼──────────────┐      │
│          │                              │     Git Sync Engine (新)   │      │
│          │                              │  commit hash / diff patch  │      │
│          │                              │  delta upload / replay     │      │
│          │                              └─────────────┬──────────────┘      │
│          │                                            │                     │
│          │                              ┌─────────────▼──────────────┐      │
│          │                              │   OAuth2 Authorization     │      │
│          │                              │   Server (授权码 + 刷新)   │      │
│          │                              └─────────────┬──────────────┘      │
│          │                                            │                     │
│   ┌──────┴────────────────────────────────────────────┴───────────────┐     │
│   │                        Browser Side                               │     │
│   │  ┌────────────────────────────┐   window.postMessage / runtime  │     │
│   │  │ DsToolKit Extended         │◄────────────────────────────────►│     │
│   │  │ (Tampermonkey UserScript)  │                                  │     │
│   │  │  ├─ DOM 拦截 DeepSeek 对话  │                                  │     │
│   │  │  ├─ 捕获新消息实时推送      │     Chrome Extension Runtime    │     │
│   │  │  ├─ 导出按钮 / UI 注入      │                                  │     │
│   │  │  └─ 会话结束触发 commit     │                                  │     │
│   │  └──────────────┬─────────────┘                                  │     │
│   │                 │ Message Passing (chrome.runtime)                │     │
│   │  ┌──────────────▼─────────────┐                                  │     │
│   │  │   DsToolKit (MV3 插件)      │                                  │     │
│   │  │  ├─ OAuth2 获取 API Token   │                                  │     │
│   │  │  ├─ Git commit 构造 diff    │                                  │     │
│   │  │  ├─ 增量上传后端 REST API   │                                  │     │
│   │  │  ├─ 连接状态 / 错误提示     │                                  │     │
│   │  │  └─ Popup 配置 & 状态面板   │                                  │     │
│   │  └────────────────────────────┘                                  │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

***

## 2. 后端改造方案（兼容现有架构）

### 2.1 数据库 Schema 扩展（Prisma）

在现有 `backend/prisma/schema.prisma` 中新增模型：

```prisma
// ═══════════ OAuth2.0 ═══════════
model OAuthClient {
  id           Int       @id @default(autoincrement())
  clientId     String    @unique
  clientSecret String    // bcrypt/argon2 哈希，不存明文
  name         String    // 应用名："DsToolKit App" / "DsToolKit Extension"
  redirectUris Json      // ["custom-scheme://callback", ...]
  scopes       Json      // ["read:conversations", "write:sync", ...]
  isPublic     Boolean   // true = PKCE flow（移动端/插件）
  enabled      Boolean   @default(true)
  createdAt    DateTime  @default(now())
  codes        OAuthCode[]
  tokens       OAuthToken[]
}

model OAuthCode {
  id          Int       @id @default(autoincrement())
  code        String    @unique           // 授权码（用后即焚）
  codeHash    String    @unique           // SHA256(code)，查询用
  clientId    Int
  client      OAuthClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  userId      Int
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  scopes      Json
  redirectUri String    @db.Text
  codeChallenge String? // S256 / plain
  codeChallengeMethod String?
  expiresAt   DateTime
  used        Boolean   @default(false)
  createdAt   DateTime  @default(now())
}

model OAuthToken {
  id           Int       @id @default(autoincrement())
  accessHash   String    @unique           // SHA256(access_token)
  refreshHash  String?   @unique           // SHA256(refresh_token)
  clientId     Int
  client       OAuthClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  userId       Int
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  scopes       Json
  accessExpiresAt  DateTime
  refreshExpiresAt DateTime?
  createdAt    DateTime  @default(now())
  lastUsedAt   DateTime?
}

// ═══════════ Git-style 同步引擎 ═══════════
enum SyncEventType {
  COMMIT    // 完整/增量提交（浏览器插件）
  MERGE     // 合并远端变更（Flutter 拉取）
  REBASE    // 变基重放
  TAG       // 语义化标记
}

model SyncCommit {
  id             Int       @id @default(autoincrement())
  commitHash     String    @unique           // SHA1-like: content-based
  parentHash     String?   // 父 commit，链表结构
  userId         Int
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  configId       Int?
  config         DeepseekConfig? @relation(fields: [configId], references: [id], onDelete: SetNull)
  deepseekConvId String?                     // 会话级粒度
  // 变更类型与内容
  eventType      SyncEventType
  changedPaths   Json                        // ["conversations/x/mapping/y", ...]
  diffPatches    Json?                       // diff-match-patch 序列化结果
  snapshotJson   Json?                       // 首次 commit 存完整 snapshot
  // 元信息
  sourceApp      String                      // "chrome-ext" / "flutter" / "web"
  message        String?                     // commit message
  sizeBytes      Int                         // 提交大小
  createdAt      DateTime  @default(now())

  @@index([userId, createdAt])
  @@index([configId, deepseekConvId])
  @@index([commitHash])
}

// 用户当前分支指针（每个 config 一个 HEAD）
model SyncHead {
  id         Int      @id @default(autoincrement())
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  configId   Int      @unique               // 每个 config 一个 HEAD
  config     DeepseekConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  headHash   String                          // 指向最新的 SyncCommit.commitHash
  updatedAt  DateTime @updatedAt

  @@unique([userId, configId])
}

// ═══════════ Flutter 离线同步日志 ═══════════
model DeviceSession {
  id          Int       @id @default(autoincrement())
  userId      Int
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId    String    @unique             // 设备 UUID
  deviceName  String?                        // "iPhone 15 Pro"
  platform    String                         // ios / android / web
  pushToken   String?    @db.Text            // FCM/APNs 推送令牌
  lastSyncedAt DateTime?
  lastIp      String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId])
}
```

### 2.2 新增路由模块

在 `backend/src/routes/` 下新增文件并在 `index.ts` 注册：

| 文件                  | 路由前缀              | 鉴权方式                    | 说明                                          |
| ------------------- | ----------------- | ----------------------- | ------------------------------------------- |
| `oauth2.routes.ts`  | `/api/oauth`      | 混合（JWT + 匿名）            | OAuth2.0 授权码 + PKCE 流程；客户端凭据流               |
| `sync.routes.ts`    | `/api/v1/sync`    | verifyApiToken (dstk\_) | Git 风格同步：push commit / pull since / HEAD 指针 |
| `devices.routes.ts` | `/api/v1/devices` | verifyApiToken          | Flutter 设备注册、推送令牌、在线状态                      |
| `push.routes.ts`    | `/api/v1/push`    | verifyJwt（Web端触发）       | 发送推送通知（手动/定时摘要）                             |

#### 2.2.1 OAuth2 核心端点

```
GET  /api/oauth/authorize
     ?response_type=code
     &client_id=dstk_app_xxx
     &redirect_uri=custom-scheme%3A%2F%2Fcallback
     &scope=read%3Aconversations%20write%3Async
     &state=xyz
     &code_challenge=XXXX...          ← PKCE
     &code_challenge_method=S256
     → 浏览器 302 → 登录 → 授权确认页 → 回跳 redirect_uri?code=...

POST /api/oauth/token              ← 无鉴权（code + client_id + verifier）
     body: { grant_type, code, redirect_uri, code_verifier, client_id }
     → { access_token, refresh_token, token_type, expires_in, scope }

POST /api/oauth/token              ← refresh_token 模式
     body: { grant_type: "refresh_token", refresh_token, client_id }
     → 新 token 对

POST /api/oauth/revoke             ← 注销（插件/APP退出登录）
     body: { token, token_type_hint }
```

#### 2.2.2 Git 同步端点

```
GET  /api/v1/sync/head?configId=N        → 当前 HEAD commitHash + 变更摘要
GET  /api/v1/sync/commits                 → 分页列出 commit 历史
GET  /api/v1/sync/pull?configId=N&since=HASH
     → 返回 [HASH1, HASH2, ...] 的 diffPatch 链 + snapshot（必要时）

POST /api/v1/sync/push                    → 浏览器插件提交变更
     body: {
       configId, parentHash,
       changedPaths,                      // 变更路径列表
       patches: [                         // diff-match-patch 数组
         { path, op, text?, range? },
       ],
       snapshot?,                         // 首次/大变更时完整 JSON
       message, sourceApp
     }
     → 201 { commitHash, newHeadHash, size, conflicts?: [] }

GET  /api/v1/sync/commit/:hash            → 获取单个 commit 的完整 diff
```

### 2.3 Git 同步引擎服务层

新增 `backend/src/services/gitSync.ts`：

```typescript
/**
 * 类 Git 同步协议核心（不依赖真实 Git 仓库，轻量实现）：
 * 1. Commit Hash = SHA1(parentHash + sorted(changedPaths) + JSON(patches/snapshot))
 * 2. 首次同步 = snapshot JSON（整份 mapping）
 * 3. 后续 = diff-match-patch 增量（只发变更文本块）
 * 4. Pull = 从 since HASH 按链表重放 patches，最终得到 latest snapshot
 * 5. Conflict = 插件 parentHash != 当前 HEAD，需要先 pull + rebase
 */

import { diff_match_patch, patch_obj } from 'diff-match-patch';
import crypto from 'node:crypto';

const DMP = new diff_match_patch();

export function computeCommitHash(
  parentHash: string | null,
  changedPaths: string[],
  payload: any,
): string {
  const data = [
    parentHash ?? '',
    JSON.stringify([...changedPaths].sort()),
    JSON.stringify(payload),
  ].join('|');
  return 'c_' + crypto.createHash('sha1').update(data).digest('hex').slice(0, 20);
}

/** 将 mapping 中某条消息做文本级 diff */
export function makeTextPatch(oldText: string, newText: string): patch_obj[] {
  const diffs = DMP.diff_main(oldText, newText);
  DMP.diff_cleanupSemantic(diffs);
  return DMP.patch_make(oldText, diffs);
}

/** 应用 patch 还原新版本 */
export function applyTextPatch(baseText: string, patches: patch_obj[]): [string, boolean[]] {
  return DMP.patch_apply(patches, baseText);
}

/**
 * 判定同步粒度：
 * - 新对话：snapshot 模式（完整 mapping + 元数据 JSON）
 * - 已有对话，改动 <50%：patch 模式
 * - 已有对话，改动 ≥50%：降级为 snapshot
 */
export function decideSyncStrategy(
  prevSizeBytes: number,
  diffSizeBytes: number,
): 'snapshot' | 'patch' {
  if (prevSizeBytes === 0) return 'snapshot';
  return diffSizeBytes / prevSizeBytes < 0.5 ? 'patch' : 'snapshot';
}
```

### 2.4 配额与限流增强

现有 `utils/quota.ts` 补充浏览器插件同步限制：

```typescript
export const TIER_LIMITS_SYNC: Record<Tier, any> = {
  FREE:     { syncEnabled: false,  syncMBPerDay: 0,    apiRatePerMin: 0 },
  PRO:      { syncEnabled: false,  syncMBPerDay: 0,    apiRatePerMin: 0 },
  PLUS:     { syncEnabled: true,   syncMBPerDay: 200,  apiRatePerMin: 100, maxDevices: 3 },
  ULTIMATE: { syncEnabled: true,   syncMBPerDay: 1000, apiRatePerMin: 500, maxDevices: 10 },
  TEAM:     { syncEnabled: true,   syncMBPerDay: 5000, apiRatePerMin: 2000, maxDevices: 30 },
};
```

在 `verifyApiToken` 中间件中调用配额检查，返回 403 "当前等级无浏览器同步权限"。

***

## 3. Flutter 移动端应用方案

### 3.1 技术选型

| 维度              | 选型                                                  | 理由                                                             |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| **SDK**         | Flutter 3.24+ / Dart 3.5+                           | 一套代码 iOS/Android；现成组件丰富；现有 Node/TS 团队可快速上手                     |
| **状态管理**        | Riverpod 2.x                                        | 编译时安全、Provider 家族统一；比 Bloc 代码量少 40%；适合多屏幕多 Tab                 |
| **路由**          | go\_router 14.x                                     | 声明式路由；深度链接支持（配合 OAuth 回跳）                                      |
| **本地持久化**       | drift (SQLite ORM) + shared\_preferences            | drift 支持复杂查询/批量同步；SP 存 JWT                                     |
| **网络**          | dio 5.x + retrofit                                  | 强类型 API 生成；Interceptor 支持自动刷新 Token                            |
| **Markdown 渲染** | flutter\_math\_fork（可降级为 flutter\_markdown）         | 参考 Experience 1149208 教训：必须实现降级渲染策略，检测失败退纯文本                   |
| **权限**          | permission\_handler 按平台分支                           | 参考 1149208：**避免用不存在的枚举**，Android 用 storage/photos、iOS 用 photos |
| **推送**          | firebase\_messaging + flutter\_local\_notifications | FCM Android、APNs iOS 桥接                                        |
| **WebView**     | webview\_flutter 4.x                                | 登录 OAuth、分享页 Web 预览                                            |

### 3.2 项目结构（建议）

```
flutter_app/
├── lib/
│   ├── main.dart                        # 启动：初始化 ProviderScope、主题、路由
│   ├── app.dart                         # MaterialApp.router 装配
│   ├── core/
│   │   ├── theme/                       # 适配 iOS/Android：Cupertino/Material 双主题
│   │   ├── router/app_router.dart       # go_router 配置 + OAuth 回调 scheme
│   │   ├── constants/api_constants.dart
│   │   └── errors/                      # 统一错误码 + 降级渲染
│   ├── data/
│   │   ├── api/                         # retrofit 生成的 REST API Client
│   │   │   ├── auth_api.dart            # 登录/注册/OAuth token
│   │   │   ├── conversations_api.dart   # /api/v1/conversations
│   │   │   ├── sync_api.dart            # /api/v1/sync/*
│   │   │   └── device_api.dart          # /api/v1/devices/*
│   │   ├── models/                      # freezed JSON 模型（与后端 Prisma 对齐）
│   │   │   ├── user.freezed.dart
│   │   │   ├── conversation.freezed.dart
│   │   │   ├── message.freezed.dart
│   │   │   └── sync_commit.freezed.dart
│   │   ├── local/                       # drift SQLite 离线缓存
│   │   │   ├── app_database.dart
│   │   │   └── daos/
│   │   └── repositories/                # 网络 + 本地合并数据源（Repository Pattern）
│   │       ├── auth_repository.dart
│   │       ├── conversation_repository.dart
│   │       └── sync_repository.dart
│   ├── features/
│   │   ├── auth/                        # 登录/注册/OAuth 授权 WebView
│   │   ├── home/                        # 底部 Tab：对话列表 / 搜索 / 统计 / 我
│   │   ├── conversation/                # 对话详情 + TurnTree Widget（Turn/Version/SubTurn）
│   │   ├── search/                      # 混合搜索：本地 SQLite + 远端 /api/v1/search
│   │   ├── stats/                       # 统计图表（fl_chart：日历热力图+柱状）
│   │   ├── sync/                        # 手动同步状态页 + Git log 可视化
│   │   ├── pricing/                     # 定价 + 卡密兑换（与 Web 端对齐）
│   │   ├── folders/                     # 文件夹 + 标签管理
│   │   ├── share/                       # 创建/查看分享链接
│   │   └── profile/                     # 个人中心 + 设备管理
│   └── widgets/
│       ├── chat_bubble.dart             # Markdown 气泡 + 降级纯文本
│       ├── turn_tree.dart               # 复刻 Web 端 TurnTree（可视化对话树）
│       └── adaptive_list.dart           # iOS 滑动删除 + Android 长按菜单
├── pubspec.yaml
└── android/  ios/                       # 平台配置：scheme、权限、FCM 配置
```

### 3.3 平台级原生适配清单

| 适配项          | Android                                                     | iOS                                        | 实现要点                                                      |
| ------------ | ----------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **OAuth 回跳** | `android:scheme="dstoolkit"` `<intent-filter>`              | `Info.plist` CFBundleURLSchemes            | 与 Flutter go\_router deep link 联动，解析 `?code=` 和 `?state=` |
| **存储权限**     | Android 13+ READ\_MEDIA\_IMAGES；12- READ\_EXTERNAL\_STORAGE | iOS NSPhotoLibraryUsageDescription         | **避免 Permission.photosFullAccess**（参考 1149208 教训）按平台分支    |
| **通知权限**     | POST\_NOTIFICATIONS（Android13+）+ FCM channel                | UNUserNotificationCenter 申请                | 冷启动点击通知跳转指定对话页                                            |
| **生物识别**     | local\_auth：指纹 + 面部                                         | FaceID / TouchID（NSFaceIDUsageDescription） | 可选：启动 App 锁屏保护对话隐私                                        |
| **分享导出**     | `share_plus` 分享文件/文本                                        | UIDocumentInteractionController            | 导出 Markdown/PDF 到系统分享面板                                   |
| **离线策略**     | `drift` 缓存 SQLite + `workmanager` 后台同步                      | `background_fetch` T+15min 最小间隔            | 弱网时本地可完整浏览，联网后差分同步                                        |
| **渲染降级**     | 公式渲染检测失败 → 退回纯文本/简化排版（1149208 经验）                           | —                                          | `flutter_math_fork` + try/catch，错误标志位决定渲染分支               |

### 3.4 核心功能流程

#### 3.4.1 OAuth2 授权 + PKCE 登录

```
Flutter App                     Backend OAuth
    │                             │
    │ 1. 生成 code_verifier (32B random)
    │    code_challenge = BASE64URL(SHA256(verifier))
    │                             │
    │ 2. 打开 WebView 到 /api/oauth/authorize?
    │    client_id=dstk_app_xxx&code_challenge=...&code_challenge_method=S256
    │    &redirect_uri=dstoolkit://oauth-callback
    │ ───────────────────────────►│
    │                             │ 3. 用户 JWT 登录（现有 /api/auth/login）
    │                             │    → 授权确认页："DsToolKit App 请求访问你的对话数据"
    │◄─────────────────────────── │ 4. 302 dstoolkit://oauth-callback?code=ABC&state=xyz
    │                             │
    │ 5. POST /api/oauth/token {
    │      grant_type: authorization_code,
    │      code: ABC, code_verifier: <原串>, redirect_uri, client_id
    │    }
    │ ───────────────────────────►│
    │◄─────────────────────────── │ 6. { access_token, refresh_token, expires_in }
    │
    │ 7. secure storage 保存 token 对
    │    后续请求：Authorization: Bearer dstk_... (access_token)
    │    过期自动走 refresh_token 流程
```

#### 3.4.2 Git 风格增量同步（Pull 方向）

```
Flutter (drift SQLite)                 Backend /api/v1/sync
       │                                   │
       │ 1. GET /sync/head?configId=N
       │    → { headHash: "c_abc123", updatedAt }
       │ ─────────────────────────────────►│
       │◄────────────────────────────────── │
       │
       │ 2. 比对本地 latestHeadHash
       │    本地 = 远端 → 无需同步
       │    本地 != 远端 → 执行 pull
       │
       │ 3. GET /sync/pull?configId=N&since=<本地hash>
       │ ─────────────────────────────────►│
       │◄────────────────────────────────── │ { commits: [
       │                                       { hash, parentHash,
       │                                         patches: [{path, op, text}],
       │                                         snapshot? }, ... ]
       │                                     }
       │
       │ 4. 按链表顺序应用 patch 到本地 SQLite
       │    - snapshot 模式：整份 upsert Conversation + Message
       │    - patch 模式：读取旧文本 → applyTextPatch → 保存新内容
       │    - 更新本地 latestHeadHash
```

### 3.5 移动端差异化 UI 组件

* **对话气泡**：`flutter_markdown` + `flutter_math_fork` + 代码高亮（`flutter_highlight`），降级为纯文本容器

* **TurnTree 可视化**：CustomPaint 绘制对话树（用户问题 → 多版本 AI 回复 → 子追问分支），可点击切换

* **自适应列表**：iOS CupertinoListTile 左滑删除；Android ListTile 长按弹出菜单（归档/删除/分享）

* **底部导航**：CupertinoTabBar (iOS) / NavigationBar Material3 (Android)，共 5 Tab：对话 / 文件夹 / 搜索 / 统计 / 我的

***

## 4. DsToolKit 浏览器插件（MV3）方案

### 4.1 定位与职责

DsToolKit 是 **Chrome/Edge MV3 Manifest V3 扩展**，承担 4 个核心职责：

1. **OAuth2 身份认证**：通过浏览器弹窗流获取 dstk\_ API Token（PLUS+ 等级用户才能创建）
2. **与 DsToolKit Extended 通信**：接收油猴脚本注入捕获的 DeepSeek 对话数据
3. **Git 风格同步上传**：构造 commit → diff → push 到后端 `/api/v1/sync/push`
4. **UI 面板**：Popup 展示连接状态、最近同步、配置管理、手动触发同步

### 4.2 Manifest 配置

```json
{
  "manifest_version": 3,
  "name": "DsToolKit - DeepSeek 对话同步器",
  "version": "1.0.0",
  "description": "无感同步 DeepSeek 官网对话至 DsToolKit 云端，支持移动端查看",
  "minimum_chrome_version": "114",
  "permissions": [
    "storage",          // 存储 API Token
    "alarms",           // 定时检查（1min）+ 断网重试队列
    "identity",         // Chrome Identity API OAuth 弹窗
    "scripting"         // 动态注入（可选，备用方案）
  ],
  "host_permissions": [
    "https://chat.deepseek.com/*",
    "https://*.deepseek.com/*",
    "https://your-dstoolkit-backend.com/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
  },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://chat.deepseek.com/*"],
    "js": ["content_bridge.js"],
    "run_at": "document_start",
    "world": "ISOLATED"
  }],
  "web_accessible_resources": [{
    "resources": ["integration.js"],
    "matches": ["https://chat.deepseek.com/*"]
  }],
  "externally_connectable": {
    "ids": []  // 不允许外部扩展连接；仅允许同来源 + 油猴通过 window.postMessage
  },
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

### 4.3 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                        DsToolKit MV3 插件                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────┐    chrome.runtime.sendMessage            │
│   │   Popup (UI)     │◄─────────────────────────────────┐       │
│   │ popup.html + Vue │                                  │       │
│   │  ├─ 连接状态灯     │                                  │       │
│   │  ├─ 最近同步列表   │                                  │       │
│   │  ├─ 配置/账号管理  │                                  │       │
│   │  └─ 手动同步按钮   │                                  │       │
│   └─────────┬────────┘                                  │       │
│             │ chrome.storage                             │       │
│             ▼                                            │       │
│   ┌─────────────────────────────────────────────────────┴──┐    │
│   │                Background Service Worker               │    │
│   │  ┌────────────────┐  ┌────────────────┐  ┌───────────┐│    │
│   │  │ OAuth Module   │  │ Git Sync Engine│  │ Retry    ││    │
│   │  │ identity API   │  │ computeHash /  │  │ Queue    ││    │
│   │  │ PKCE flow      │  │ diff-match-    │  │ (Alarms) ││    │
│   │  │ token refresh  │  │ patch          │  │ Offline  ││    │
│   │  └──────┬─────────┘  └──────┬─────────┘  └─────┬─────┘│    │
│   └─────────┼───────────────────┼───────────────────┼──────┘    │
│             │                   │                   │           │
│             │ fetch()           │ POST /sync/push  │           │
│             ▼                   ▼                   ▼           │
│        DsToolKit Backend                                  │
│        /api/oauth/*        /api/v1/sync/*                         │
│                                                                 │
│             ▲                                                   │
│             │ chrome.runtime.onMessageExternal + postMessage   │
│             │                                                   │
│   ┌─────────┴───────────────────────────────────────────────┐   │
│   │              Content Script (content_bridge.js)         │   │
│   │  · 建立 postMessage 通道 ←→ Extended 油猴脚本            │   │
│   │  · 转发 DeepSeek 对话数据到 Service Worker               │   │
│   │  · 回传同步状态（成功/失败/进度）到页面 UI 注入             │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 与 Extended（油猴脚本）的通信协议

**通道安全原则**：油猴脚本运行在 `MAIN` world（页面上下文），content\_bridge 运行在 `ISOLATED` world。它们之间通过 `window.postMessage` + HMAC 签名校验通信，避免伪造。

```typescript
// content_bridge.js — 插件侧（ISOLATED world）
const PROTOCOL_VERSION = '1.0';
const BRIDGE_NAME = 'dstoolkit-bridge';

window.addEventListener('message', (event) => {
  if (event.origin !== 'https://chat.deepseek.com') return;
  const msg = event.data;
  if (!msg || msg.__dstk !== PROTOCOL_VERSION) return;
  if (!verifyHmac(msg)) return;  // 防止页面 JS 伪造
  switch (msg.type) {
    case 'NEW_MESSAGE':
      chrome.runtime.sendMessage({ type: 'SYNC_NEW_MESSAGE', payload: msg.payload });
      break;
    case 'CONVERSATION_END':
      chrome.runtime.sendMessage({ type: 'SYNC_COMMIT', payload: msg.payload });
      break;
    case 'REQUEST_STATUS':
      // 回传插件连接状态给 Extended（油猴用于显示 UI）
      break;
  }
});
```

### 4.5 OAuth2 认证（插件版）

使用 Chrome `chrome.identity.launchWebAuthFlow` 配合 PKCE：

```typescript
// background.js OAuth Module
import { sha256, base64UrlEncode, randomString } from './crypto.js';

export async function authorizeAndGetToken(): Promise<TokenPair> {
  const verifier = randomString(32);
  const challenge = base64UrlEncode(await sha256(verifier));
  const state = randomString(16);

  const authUrl = `${BACKEND}/api/oauth/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: EXT_CLIENT_ID,
    redirect_uri: chrome.identity.getRedirectURL(), // chrome-extension://<id>/
    scope: 'read:conversations write:sync offline_access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl, interactive: true,
  });

  const code = new URL(resultUrl).searchParams.get('code');
  // ... POST /api/oauth/token with code + verifier
}
```

### 4.6 断网重试队列

使用 `chrome.alarms` + IndexedDB（Service Worker 内）实现离线队列：

```
新数据到达
   │
   ├─ 在线 → 立即 POST /sync/push
   │         成功 → 更新 HEAD Hash
   │         失败 4xx → 通知用户（令牌过期/权限不足）
   │         失败 5xx / 网络错误 → 入队
   │
   └─ 离线 → 入 IndexedDB sync_queue 表
             chrome.alarms.create('retry-queue', { periodInMinutes: 1 })
             → 每隔 1 分钟批量出队重试（指数退避）
```

***

## 5. DsToolKit Extended（油猴脚本）方案

### 5.1 定位与职责

油猴脚本是**页面级深度注入器**（Tampermonkey / Violentmonkey 兼容），负责：

1. **DOM 深度拦截**：监听 DeepSeek 官网的对话渲染/消息生成，在用户交互层捕获真实数据
2. **消息级捕获**：

   * 用户发送消息时捕获输入内容

   * AI 流式生成完毕后捕获最终 markdown 文本

   * 捕获重新生成/编辑消息产生的对话树分支（mapping 结构）
3. **UI 辅助注入**：在 DeepSeek 页面角落注入"同步状态角标"、"手动同步按钮"、"导出到 DsToolKit"菜单
4. **数据桥接**：通过 `window.postMessage` 将捕获数据发给 DsToolKit（MV3 插件），后者负责鉴权与上传

### 5.2 脚本头部

```javascript
// ==UserScript==
// @name         DsToolKit Extended - DeepSeek 对话同步助手
// @namespace    https://your-dstoolkit-domain.com
// @version      1.0.0
// @description  配合 DsToolKit 浏览器插件，从 DeepSeek 官网深度捕获对话并云端同步
// @author       DsToolKit Team
// @match        https://chat.deepseek.com/*
// @match        https://www.deepseek.com/*/chat/*
// @grant        none
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/diff-match-patch@1.0.5/index.js
// @connect      *
// ==/UserScript==
```

### 5.3 DeepSeek 数据捕获策略（三层兜底）

```
┌──────────────────────────────────────────────────────┐
│ 捕获层级（优先级从高到低，每层失败自动 fallback）    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  L1 · DOM MutationObserver（最稳定）                 │
│     ├─ 监听聊天容器 <div data-testid="chat-msgs">    │
│     ├─ 新增消息节点 → 抓取 innerText / data-content │
│     ├─ 用户输入框 → input 事件 + 发送按钮 click 截获 │
│     └─ 重新生成按钮 → click → 标记为新 version        │
│                                                      │
│  L2 · Fetch/XHR 拦截（获取结构化数据）                │
│     ├─ 重写 window.fetch 拦截 `/v1/chat/completions` │
│     ├─ 解析 SSE stream 获取 AI 最终回复              │
│     ├─ 拦截会话保存接口（mapping 同步上传）          │
│     └─ 直接拿到完整 JSON，零解析误差                 │
│                                                      │
│  L3 · window.__NUXT__ / React Fiber 状态（备用）     │
│     ├─ 遍历页面 React internalFiber 节点             │
│     ├─ 提取 props.messages / conversation.state     │
│     └─ L1 + L2 均失效时（官网改版）兜底方案          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 5.4 捕获时机（对话无感同步触发点）

| 触发时机        | 触发条件                                    | 同步粒度     | 说明                                 |
| ----------- | --------------------------------------- | -------- | ---------------------------------- |
| **用户消息发送**  | 检测到发送按钮 click / Enter keydown 且输入框非空    | patch 级  | 立即把用户输入发到插件，预建 Turn                |
| **AI 回复完成** | 流式打字结束（3 秒内无新字符增量）                      | patch 级  | 构造 REPLY 消息 + 关联 Turn 的最新 Version  |
| **重新生成**    | 点击"重新生成"按钮                              | patch 级  | 新建 VersionIndex + 标记 parentVersion |
| **编辑消息**    | 用户编辑已发送消息并重新提交                          | patch 级  | 新建 Turn 分支（parentId 指向被编辑节点）       |
| **会话切换**    | URL hash / router 变化（deepseekConvId 改变） | commit 级 | 把当前会话做一次完整 commit，关闭上一个编辑态         |
| **页面卸载/隐藏** | `visibilitychange` / `beforeunload`     | commit 级 | 做最终一致性提交，防止丢失未保存内容                 |
| **手动按钮**    | 注入的"立即同步"按钮                             | commit 级 | 用户主动触发全量 snapshot 校验               |

### 5.5 注入的 UI 组件

在 DeepSeek 页面 **右上角落**（不遮挡官方 UI）注入：

```
┌────────────────────────────────────────────────────────┐
│ DeepSeek Logo  搜索  升级  历史  个人头像   [◆ DS同步] ← 注入角标
│                                                ├─ 绿点 = 已连接/已同步
│                                                ├─ 黄点 = 同步中/队列待处理
│                                                ├─ 红点 = 未连接/错误（点击跳转 Popup）
├────────────────────────────────────────────────────────┤
│                                                        │
│  每条消息悬浮菜单（右...更多）                         │
│  ├─ 复制 / 重生成 / 编辑                               │
│  └─ 📌 导出到 DsToolKit（新增） ← Extended 注入        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 5.6 Extended 与 DsToolKit MV3 的协作流程

```
DeepSeek 官网页面
    │
    │ 用户发消息 / AI 回复
    ▼
DsToolKit Extended（油猴 MAIN world）
    │ 1. 捕获消息内容 + turn/version 元信息
    │ 2. 构造 { convId, nodeId, parentId, role, content, timestamp, mapping }
    │ 3. HMAC 签名（用与插件约定的随机 salt，每次会话换）
    │ 4. window.postMessage 发往 ISOLATED world
    ▼
content_bridge.js（MV3 content script ISOLATED world）
    │ 1. 校验 origin + HMAC
    │ 2. chrome.runtime.sendMessage 转发到 background
    ▼
background Service Worker
    │ 1. 查 configId（首次需选择 DeepseekConfig）
    │ 2. 调用 gitSync: computeCommitHash → 决定 patch/snapshot
    │ 3. POST /api/v1/sync/push（Bearer dstk_...）
    │ 4. 成功 → 更新 popup chrome.storage 状态 + 通知 Extended 显示绿点
    │ 5. 失败 → 入 retry 队列 + 通知 Extended 显示黄/红点
    ▼
   Backend
    │ 1. verifyApiToken 检查等级与配额
    │ 2. check parentHash == HEAD？ → 冲突返回 409 + 建议 pull
    │ 3. 写 SyncCommit + 更新 SyncHead
    │ 4. 应用 patch/snapshot → Conversation + Message 表 upsert
    ▼
   MySQL / Prisma
```

***

## 6. OAuth2 + RESTful API 认证体系设计

### 6.1 OAuth 客户端登记（预置 + 自服务）

后端启动时 seed 两个内置客户端：

```typescript
// backend/src/index.ts seed() 扩展
const builtinClients = [
  {
    name: 'DsToolKit Mobile App',
    clientId: 'dstk-mobile-app',
    isPublic: true,   // PKCE 模式，不需要 client_secret
    redirectUris: ['dstoolkit://oauth-callback', 'com.dstoolkit.app://callback'],
    scopes: ['read:conversations', 'write:sync', 'offline_access', 'profile'],
  },
  {
    name: 'DsToolKit Browser Extension',
    clientId: 'dstk-browser-ext',
    isPublic: true,
    redirectUris: ['https://<ext-id>.chromiumapp.org/'],  // Chrome identity API 生成
    scopes: ['read:conversations', 'write:sync', 'offline_access'],
  },
];
```

用户 Web 端（PLUS+ 等级）可在个人中心"开放平台"页自助创建第 3 方 OAuth 应用（类似 GitHub），这本身也是增值功能，可作为 ULTIMATE 特权。

### 6.2 双轨 Token 体系（与现有架构兼容）

```
┌──────────────────────────────────────────────────────────────┐
│                      DsToolKit 双轨 Token                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  轨 1 · Web JWT Token（现有，不变）                           │
│    用途：Web 端 Vue 应用登录                                   │
│    头部：Authorization: Bearer <jwt.header.payload.sign>     │
│    校验：verifyJwt 中间件（JWT payload.sub = userId）        │
│    接口：/api/auth/*  /api/conversations /api/folders ...    │
│                                                              │
│  轨 2 · dstk_ RESTful API Token（现有，扩展 OAuth 颁发）      │
│    用途：Flutter App / MV3 插件 / 第三方开发者               │
│    头部：Authorization: Bearer dstk_<48 chars hex>           │
│    校验：verifyApiToken → SHA256 查 ApiToken 表 → 查等级配额 │
│    接口：/api/v1/*                                           │
│    颁发方式：                                                 │
│    ├─ a) Web 手动创建（/api/tokens POST） ← 现有             │
│    └─ b) OAuth2 授权码流程 → 后端生成 dstk_ token ← 新增     │
│                                                              │
│  兼容性：所有 /api/v1/* 继续使用 verifyApiToken              │
│         OAuth2 流程成功后，后端内部写 ApiToken 表             │
│         并额外写 OAuthToken 表（维护 refresh 关联）           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 统一 Scopes 与权限矩阵

| Scope                 | 说明                         | 授权端点                                |
| --------------------- | -------------------------- | ----------------------------------- |
| `read:conversations`  | 读取会话列表 / 详情 / 消息           | GET /api/v1/configs/\*              |
| `write:sync`          | 提交 Git 同步（push/commit）     | POST /api/v1/sync/push              |
| `write:conversations` | 手动创建/修改会话                  | PUT/DELETE /api/v1/conversations/\* |
| `search`              | 调用搜索 API                   | GET /api/v1/search                  |
| `profile`             | 读取/修改个人信息                  | GET /api/v1/me                      |
| `offline_access`      | 颁发 refresh\_token（30 天有效期） | POST /api/oauth/token refresh       |
| `admin`               | 管理后台（仅 ADMIN 角色）           | /api/admin/\*                       |

### 6.4 新 OAuth2 路由接入到现有中间件

在 `backend/src/middleware/auth.ts` 新增：

```typescript
/**
 * 混合鉴权：优先 dstk_ API Token，其次 OAuth Access Token，最后普通 JWT
 */
export async function verifyAnyToken(req: AuthedRequest, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: '缺少凭据' });

  // 1) dstk_ API Token（轨 2）
  if (isApiTokenFormat(token)) return verifyApiToken(req, res, next);

  // 2) OAuth2 Access Token（新表）
  const hash = hashToken(token);
  const oauthTk = await prisma.oAuthToken.findUnique({
    where: { accessHash: hash },
    include: { user: true },
  });
  if (oauthTk) {
    if (oauthTk.accessExpiresAt < new Date())
      return res.status(401).json({ error: 'OAuth 令牌已过期，请用 refresh_token 换新' });
    req.user = { id: oauthTk.user.id, username: oauthTk.user.username, role: oauthTk.user.role };
    prisma.oAuthToken.update({ where: { id: oauthTk.id }, data: { lastUsedAt: new Date() } }).catch(()=>{});
    return next();
  }

  // 3) Web JWT（轨 1）
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, username: payload.username, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: '令牌无效或格式不支持' });
  }
}
```

***

## 7. Git 同步协议详解（"Git 技术"落地）

### 7.1 术语映射

| Git 概念          | DsToolKit 实现                                                 | 存储位置                        |
| --------------- | ------------------------------------------------------------ | --------------------------- |
| Repository      | User + DeepseekConfig 组合                                     | SyncHead（每 config 一个）       |
| Commit          | SyncCommit 行：content-based hash + parentHash 链表              | SyncCommit 表                |
| Blob            | Conversation.mapping 中的消息节点 JSON 片段                          | 结构化 → Message 表             |
| Tree            | 路径 `conversations/{deepseekConvId}/mapping/{nodeId}/content` | 逻辑路径，不单独存                   |
| Diff Patch      | diff-match-patch 序列化（`DMP.patch_toText`）                     | SyncCommit.diffPatches JSON |
| Branch HEAD     | 每个 config 指向最新 commitHash                                    | SyncHead.headHash           |
| Snapshot (初始提交) | 完整 conversation JSON（rawMapping）                             | SyncCommit.snapshotJson     |
| Fast-forward    | parentHash == current HEAD，直接追加                              | 无冲突 push                    |
| Merge Conflict  | push 时 parentHash != HEAD，返回 409 + 远端链                       | 需先 pull + rebase            |

### 7.2 Commit 内容格式

SyncCommit.diffPatches 的 JSON Schema：

```json
[
  {
    "path": "conversations/20339595-e458-460d-af70-e79813de2bd1/title",
    "op": "replace",
    "text": "AI微调数据格式（版本2）"
  },
  {
    "path": "conversations/20339595-e458-460d-af70-e79813de2bd1/mapping/6/content",
    "op": "patch",
    "dmpText": "@@ -127,15 +127,18 @@\n-方案对比\n+方案对比（性能优化版）\n..."
  },
  {
    "path": "conversations/20339595-e458-460d-af70-e79813de2bd1/mapping/10",
    "op": "add",
    "value": {
      "id": "10", "parent": "8", "children": [],
      "message": { "model": "deepseek-chat", "inserted_at": "...",
                   "fragments": [{ "type": "RESPONSE", "content": "新回复文本..." }] }
    }
  },
  {
    "path": "conversations/20339595-e458-460d-af70-e79813de2bd1/mapping/9",
    "op": "remove"
  }
]
```

### 7.3 Push 冲突与合并流程

```
插件 push (parentHash = H_A)                    Backend (HEAD = H_C, H_A 是 H_C 祖先)
        │                                               │
        │ POST /api/v1/sync/push                       │
        │ { parentHash: H_A, patches: P_AB }           │
        ├──────────────────────────────────────────────►│
        │                                               │ 检查 HEAD != H_A → 冲突
        │◄──────────────────────────────────────────────┤
        │ 409 Conflict                                  │
        │ { error: "FAST_FORWARD_REQUIRED",             │
        │   currentHead: H_C,                           │
        │   commits: [H_B, H_C] /* 缺失的 commit */ }   │
        │                                               │
        │                                               │
 插件本地：先 pull H_B + H_C 应用到本地快照
         以 H_C 作为新 parentHash，重新计算本次 patches（可能有冲突节点）
         自动合并（非重叠路径=无损；重叠路径=远端优先，本地追加 version）
         → POST /api/v1/sync/push { parentHash: H_C, patches: P_CD }
        ├──────────────────────────────────────────────►│
        │◄──────────────────────────────────────────────┤ 201 { commitHash: H_D }
```

### 7.4 数据大小优化策略

| 场景                             | 策略                                      | 压缩比         |
| ------------------------------ | --------------------------------------- | ----------- |
| 首次同步 500 对话 × 完整 JSON (\~50MB) | snapshot 模式 + 先 gzip 压缩 body；服务端 gunzip | 85%+        |
| 用户每发一条消息                       | path-based add node op（\~200B）          | 99% vs 重发整份 |
| AI 修改一句话（编辑重生成）                | dmp text patch（原句 500 字 → patch \~80B）  | 95%         |
| 会话切换 commit                    | 只包含当前会话在本窗口内的 patch 列表                  | —           |
| 超过 7 天未同步                      | 主动 snapshot 模式（避免 patch 链太长 replay 慢）   | —           |

***

## 8. 商业策略与付费闭环

### 8.1 付费门槛矩阵

```
┌──────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ 功能 / 等级       │  FREE    │   PRO    │  PLUS    │ ULTIMATE │   TEAM   │
├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Web 端导入&查看  │    ✓     │    ✓     │    ✓     │    ✓     │    ✓     │
│ Flutter App      │ 基础阅读 │ 基础阅读 │  全功能  │  全功能  │  全功能  │
│ 创建 API Token   │    ✗     │    ✗     │    ✓     │    ✓     │    ✓     │
│ 浏览器插件使用   │    ✗     │    ✗     │    ✓     │    ✓     │    ✓     │
│ 油猴 Extended    │    ✗     │    ✗     │    ✓     │    ✓     │    ✓     │
│ Git 自动同步     │    ✗     │    ✗     │ 200MB/天 │ 1GB/天   │ 5GB/天   │
│ API 速率         │    0     │    0     │ 100/min  │ 500/min  │ 2000/min │
│ 在线设备数       │    1     │    1     │    3     │   10     │   30     │
│ 分享/密码/主题   │    ✗     │    ✓     │    ✓     │    ✓     │    ✓     │
│ 自定义短链       │    ✗     │    ✗     │    ✓     │    ✓     │    ✓     │
│ AI 摘要/积分     │ 5次/天   │ 50/月    │ 500/月   │ 2000/月  │ 1000/席  │
│ 第3方 OAuth App  │    ✗     │    ✗     │    ✗     │    ✓     │    ✓     │
└──────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

### 8.2 转化路径设计

```
首次访问 dstoolkit Web
    │
    ├─ 注册免费账号 → 导入 1-2 份 DeepSeek 导出 ZIP 体验功能
    │     │
    │     ▼
    │  感觉不错 → 下载 Flutter App
    │     │
    │     │ App Store 提示："想自动同步？请升级 PLUS → 创建 API Token"
    │     ▼
    │  定价页（Pricing.vue 已存在） → kufaka 购买 PLUS 年付 ¥39 / 永久 ¥129
    │     │
    │     ▼
    │  兑换卡密 → 等级变为 PLUS
    │     │
    │     ├─ 个人中心 → API Token → 创建 1 个 dstk_...
    │     │
    │     ├─ 用 API Token 配置 Chrome MV3 插件（或 OAuth 一键授权）
    │     │
    │     └─ 安装 DsToolKit Extended 油猴脚本
    │
    │          ↓ 开始无感同步（官网聊天 → 自动 → 云端 → Flutter 实时可见）
    │
    │  产生强数据黏性 → 续费 → 升级 ULTIMATE（更快同步、更多设备、知识图谱）
    │
    └─ 团队场景 → TEAM 版（多人共享知识库 + SSO + 审计）
```

### 8.3 浏览器插件的"锁"机制（强制付费）

**核心约束**：DsToolKit（MV3 插件）的 Popup 中 **必须** 有一个可用的 dstk\_ API Token 才能开启同步功能。没有 Token 时：

* Popup 显示大红色状态："未配置 API Token（需要 PLUS 及以上权限）"

* 按钮 1："去 Web 创建 Token → 自动打开 /profile 页（带教程）"

* 按钮 2："OAuth 授权登录 → 启动 OAuth 流程（同样检查后端 tier，未达 PLUS 返回 403 错误并引导升级）"

* Extended 的同步角标**持续显示红色**，并在点击时弹出"解锁同步"浮层

### 8.4 免费试用（钩子）

* 新用户注册即送 **7 天 PLUS 试用**，可创建 **1 个临时 API Token**（7 天后失效）

* 试用到期后：已同步的数据可继续在 Flutter App 中**只读**访问，但**不能再用插件做新同步**

* 转化话术："您已有 238 条对话自动同步至云端。续费 PLUS 保持您的官网对话实时同步到手机。"

***

## 9. 实施路线图

### Phase 1 · 后端基建（2 周）

| 任务                                 | 产出                                                               |
| ---------------------------------- | ---------------------------------------------------------------- |
| Prisma Schema 扩展 + db push/migrate | `OAuthClient/Code/Token`、`SyncCommit/Head`、`DeviceSession` 模型    |
| OAuth2.0 + PKCE 端点                 | `oauth2.routes.ts` + 单元测试（授权码、刷新、吊销、PKCE 校验）                     |
| Git Sync Engine + 端点               | `services/gitSync.ts` + `sync.routes.ts`（push/pull/head/commits） |
| 配额 & 限流对接                          | `verifyApiToken` 内检查 tier 是否具备 syncEnabled                       |
| ApiToken 支持由 OAuth 流程创建            | `/api/oauth/token` 内部写 ApiToken 表并返回 dstk\_ 明文                   |
| 设备端点                               | `devices.routes.ts`（注册/列表/删除）                                    |
| 单元测试 & 文档                          | Vitest 覆盖率 ≥ 70%；VitePress 文档：OAuth Guide / Sync API 参考          |

### Phase 2 · 浏览器插件 + 油猴（2 周）

| 任务                         | 产出                                                             |
| -------------------------- | -------------------------------------------------------------- |
| DsToolKit MV3 scaffold     | Manifest + background SW + content\_bridge + popup (Vue 3 CDN) |
| OAuth2 PKCE + identity API | 插件侧登录 / 登出 / refresh / 状态持久化                                   |
| Git push + 断网重试队列          | commit 构造 → patch/snapshot 决策 → IndexedDB 队列 + alarms 重试       |
| DsToolKit Extended 油猴脚本    | L1+L2 捕获 + postMessage 通信 + HMAC 签名 + UI 注入                    |
| postMessage 安全协议验证         | 互测、XSS 注入点检查                                                   |
| Popup UI                   | 连接状态、最近同步列表、Token 管理、手动同步按钮                                    |
| Chrome 商店上架资料              | 图标、截图、描述、隐私政策页                                                 |

### Phase 3 · Flutter App（4 周）

| 任务                 | 产出                                                            |
| ------------------ | ------------------------------------------------------------- |
| Flutter scaffold   | Riverpod + go\_router + drift + retrofit 脚手架                  |
| OAuth PKCE 登录模块    | WebView 授权 + 自定义 scheme 回跳 + secure storage                   |
| 核心数据层              | freezed models / retrofit API Client / drift DAO / Repository |
| 对话列表 + 搜索          | 列表卡片 + 过滤 + 本地 + 远端混合搜索                                       |
| 对话详情 + Markdown 渲染 | 气泡 UI + 降级策略 + TurnTree 可视化 + 代码高亮                            |
| Git pull 增量同步      | 手动/自动同步进度条 + 冲突提示 + 日志页                                       |
| 个人中心 + 定价 + 卡密兑换   | 与 Web 端定价对齐；App Store 内购或跳 kufaka（审核友好）                       |
| 平台适配（权限/通知/分享/导出）  | Android/iOS 各 1 台真机调通                                         |
| Push 通知（可选）        | FCM/APNs 注册 + 后端 push 端点                                      |

### Phase 4 · 联调 + 上线（1 周）

* 端到端测试：DeepSeek 官网聊天 → Extended 捕获 → MV3 push → 后端落库 → Flutter 立即看到

* 性能压测：50 用户并发、1 万条对话同步、冲突合并

* 文档 + 使用教程 + 常见问题

**合计：约 9 周**（可并行 Phase 2/3，实际 6-7 周）

***

## 10. 风险与缓解

| 风险                                 | 概率 | 影响 | 缓解措施                                                                 |
| ---------------------------------- | -- | -- | -------------------------------------------------------------------- |
| DeepSeek 官网 DOM 改版导致 Extended 捕获失效 | 高  | 中  | 三层兜底（L1 DOM / L2 Fetch / L3 ReactFiber）；建立 CI 定期跑 smoke test + 告警    |
| Flutter 三方包兼容问题（公式渲染崩溃）            | 中  | 中  | 参考 1149208：降级渲染策略 + try/catch 切换分支；锁定兼容版本                            |
| MV3 Service Worker 睡眠（状态丢失）        | 中  | 低  | 所有状态存 `chrome.storage` + IndexedDB；用 `chrome.alarms` 代替 `setTimeout` |
| OAuth 回调 scheme 在 App Store 被拒     | 低  | 高  | 同时提供 Universal Link（iOS）+ App Links（Android）作为 fallback              |
| 同步冲突数据损坏                           | 中  | 高  | 每次 push 前做 hash 校验；后端保留完整 commit 链 → 可回滚到任意历史版本                      |
| 浏览器"隐私模式"拒绝扩展                      | 低  | 低  | Popup 检测并提示用户开启；Extended 提示"请允许扩展运行"                                 |

***

## 11. 关键成功指标（KPIs）

| 指标                | Phase 3 上线目标 | 6 个月目标 |
| ----------------- | ------------ | ------ |
| PLUS+ 付费用户数（含试用）  | 500          | 3000   |
| 浏览器插件日活用户         | 200          | 1500   |
| Flutter App 下载量   | 1000         | 8000   |
| 平均每日同步 commit 数   | 5000         | 50000  |
| 同步成功率（一次 push 成功） | ≥95%         | ≥99%   |
| 试用 → 付费转化率        | 8%           | 15%    |

