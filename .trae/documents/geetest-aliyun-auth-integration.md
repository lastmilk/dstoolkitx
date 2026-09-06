# 接入极验 + 阿里云短信认证 + 阿里云号码认证 + 手机号绑定

## 一、需求摘要

1. **极验 GT4**：Web（`https://static.geetest.com/v4/gt4.js`）+ 移动端（Android SDK）都接入，用于登录/注册/发短信前的行为验证
2. **阿里云短信认证服务**（dypnsapi，免签名模板审批）：Web 端「手机号+验证码」登录/注册；移动端作为一键登录失败时的降级方案
3. **阿里云号码认证服务**（一键登录）：仅移动端（Android）
4. **用户名/密码注册保留**（经确认即指现有注册方式，下文称"传统注册"）：新传统注册用户必须绑定手机号后才能使用云端模式；存量用户不受影响

### 用户已确认的决策
- 用户名/密码注册 =「邮箱注册」的指代，保留该方式
- 短信验证码登录遇到新手机号 → **自动注册**（自动生成用户名、免密码）
- Web **不**接入 H5 一键登录（H5 SDK 不使用）
- 云端拦截方式：**后端硬拦截** + 前端引导绑定

### 关键现状（已探明）
- 后端 [auth.routes.ts](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/src/routes/auth.routes.ts) 仅用户名/密码注册登录；[schema.prisma](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/prisma/schema.prisma) User 模型无 phone/email 字段
- 云端模式唯一落库闸门在 [config.routes.ts#L110](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/src/routes/config.routes.ts#L110)（`user.cloudSyncEnabled` 检查）
- Web token 存 localStorage `dstoolkit_token`；Flutter 走 JWT → OAuth2 PKCE 双令牌流程（[auth_controller.dart](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/lib/features/auth/auth_controller.dart)）
- SDK 已在根目录：`gt4-android-sec.zip`（含 `SDK/geetest_captcha_android_v1.8.14_20260804.aar`）、`numberAuthSDK_APP_Android_v2.14.23...zip`（含 `Demo/app/libs/auth_number_product-2.14.23-log-online-standard-cuum-release.aar`）、`AppSignGet.apk`（取签名用，非代码）
- 阿里云官方 Node SDK `@alicloud/dypnsapi20170525@2.0.0` 已确认存在（含 SendSmsVerificationCode / CheckSmsVerificationCode / GetMobile）
- 极验服务端二次校验：`POST https://captcha4.geetest.com/validate?captcha_id=<id>`，`sign_token = HMAC-SHA256(key, lot_number)`

## 二、后端改动（backend/，pnpm）

### 2.1 依赖与配置
- `pnpm add @alicloud/dypnsapi20170525`（纯 JS Tea 库，无构建脚本问题）
- `.env` 追加（不入库）：
  ```
  GEETEST_WEB_ID=0aa937a16ddd5870c8df673d997e35b4
  GEETEST_WEB_KEY=0915cb526f24a6cccf4549a658b413cd
  GEETEST_APP_ID=fd925dfbb79efc2467eb99cd89fcd512
  GEETEST_APP_KEY=cc899bf27995e9e4a192e27bb63efbfd
  ALIYUN_ACCESS_KEY_ID=LTAI5t9vSNLrKGXgHqGKubzS
  ALIYUN_ACCESS_KEY_SECRET=2Dosc5dOT5rR6x3daAg1Iv5F2QFD75
  ```
- [env.ts](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/src/config/env.ts) 增加对应字段：`geetest: { webId, webKey, appId, appKey }`、`aliyun: { akId, akSecret }`；**全部为可选**——未配置时极验校验自动跳过（开发环境友好），未配置阿里云则短信/号码认证端点返回 503

### 2.2 Prisma Schema（[schema.prisma](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/prisma/schema.prisma)）
```prisma
enum RegistrationType {
  LEGACY            // 存量用户：云权限保留，不强制绑手机
  USERNAME_PASSWORD // 新传统注册：必须绑手机才能用云端
  PHONE             // 手机号验证码/一键登录注册
}
model User {
  // ...现有字段
  phone            String?          @unique
  phoneVerifiedAt  DateTime?
  registrationType RegistrationType @default(LEGACY)
}
```
执行 `npm run prisma:push`（存量用户默认 LEGACY → 自动满足"自此往后"语义）。

### 2.3 新增服务
| 文件 | 职责 |
|---|---|
| `src/services/geetest.ts` | `verifyCaptcha(captchaId, p)`：按 captcha_id 查 key（仅接受 web/app 两对配置）→ HMAC-SHA256 算 sign_token → POST validate 接口 → `result==='success'`；网络异常按官方"abort"策略视为失败 |
| `src/services/aliyunDypns.ts` | 懒初始化 dypnsapi client；`sendSmsCode(phone, countryCode='86')`、`checkSmsCode(phone, code)`、`getMobile(accessToken)` 三方法，统一抛带中文 message 的 Error |
| `src/utils/ratelimit.ts` | 内存滑动窗口限流：`hit(key, {min, max})`；短信发送用（重启即清，可接受） |

### 2.4 新增中间件/辅助
- `src/middleware/captcha.ts`：`requireCaptcha`——从 body.captcha 解析 `{captcha_id, lot_number, captcha_output, pass_token, gen_time}`，调 geetest 服务；两对 key 均未配置时放行（dev）
- `src/utils/cloudgate.ts`：`needsPhoneForCloud(user) = user.registrationType === 'USERNAME_PASSWORD' && !user.phone`；错误响应统一 `{ error: '请先绑定手机号后再使用云端模式', code: 'PHONE_REQUIRED_FOR_CLOUD' }`

### 2.5 [auth.routes.ts](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/src/routes/auth.routes.ts) 修改
| 端点 | 改动 |
|---|---|
| `POST /register` | zod 加 `captcha` 字段 + `requireCaptcha`；创建用户时 `registrationType: 'USERNAME_PASSWORD'` |
| `POST /login` | 加 `captcha` 字段 + `requireCaptcha` |
| `POST /sms/send` 新增 | body `{ phone, captcha }` → 极验 → 频控（同手机号 60s 间隔、10 条/天；同 IP 30 次/时）→ `sendSmsCode` |
| `POST /sms/login` 新增 | body `{ phone, code }` → `checkSmsCode` → 按手机号 find-or-create（新用户：`username = 'u' + 10位随机数字` 冲突重试、`passwordHash = hash(randomUUID())` 不可密码登录、`registrationType: 'PHONE'`、`phoneVerifiedAt: now`）→ 返回与 /login 同构 `{ token, user }` |
| `POST /number-auth/login` 新增 | body `{ token }`（App SDK getLoginToken 产物）→ `getMobile` 拿手机号 → 同上 find-or-create → JWT |
| `POST /phone/send-code` 新增 | `verifyJwt` + 极验 + 频控（同手机 60s/5 条/天）→ `sendSmsCode` |
| `POST /phone/bind` 新增 | `verifyJwt` + `{ phone, code }` → `checkSmsCode` → 手机号未被占用（`@unique` 冲突返回 409）→ `update({ phone, phoneVerifiedAt })` |
| `GET /me` | select 加 `phone, phoneVerifiedAt, registrationType`，响应返回脱敏手机号（`138****1234`）与 `registrationType` |
| `PUT /cloud-sync` | `enabled=true && needsPhoneForCloud(user)` → 403 `PHONE_REQUIRED_FOR_CLOUD` |

### 2.6 云端闸门
[config.routes.ts#L110](file:///home/pmfish/Documents/trae_projects/dstoolkit/backend/src/routes/config.routes.ts#L110) 在 `cloudSyncEnabled` 检查**之前**插入：
```ts
if (needsPhoneForCloud(user)) return res.status(403).json({ error: '...', code: 'PHONE_REQUIRED_FOR_CLOUD' })
```
（Git 仓库经导入创建，闸住导入即闸住 Git 生态，无需在 git.routes 重复拦截。）

## 三、Web 前端改动（frontend/dstoolkit_frontend/，Element Plus）

### 3.1 基础设施
- [index.html](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/index.html) `<head>` 加 `<script src="https://static.geetest.com/v4/gt4.js"></script>`
- `.env.local`：`VITE_GEETEST_CAPTCHA_ID=0aa937a16ddd5870c8df673d997e35b4`
- 新增 `src/utils/geetest.ts`：Promise 化封装——`showGeetest(): Promise<GeetestParams>`（`initGeetest4({captchaId, product:'bind', language:'zh-cn'})` → `showCaptcha()` → onSuccess resolve 四参数+captcha_id；onError reject）。声明 `window.initGeetest4` 全局类型

### 3.2 页面
| 文件 | 改动 |
|---|---|
| [Login.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/auth/Login.vue) | `el-tabs`：「验证码登录」（默认）手机号+验证码输入+「获取验证码」按钮（点击先 `showGeetest()` → `/auth/sms/send`，60s 倒计时）+「登录 / 注册」按钮 → `/auth/sms/login`；「密码登录」提交前先 `showGeetest()` 把参数随 `/auth/login` 提交 |
| [Register.vue](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/views/auth/Register.vue) | 保留用户名/密码表单，提交前 `showGeetest()`；注册成功自动登录后跳转 `/bind-phone`（可跳过，仅云端受限） |
| `views/auth/BindPhone.vue` 新增 | 登录态页：手机号+验证码+极验，调 `/auth/phone/send-code` + `/auth/phone/bind`，成功后回 Profile/Configs |
| [stores/auth.ts](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/stores/auth.ts) | User 接口加 `phone/registrationType`；新增 `smsSend/smsLogin/bindPhone` actions；getter `needsPhoneForCloud` |
| [router/index.ts](file:///home/pmfish/Documents/trae_projects/dstoolkit/frontend/dstoolkit_frontend/src/router/index.ts) | 加 `/bind-phone`（需登录） |
| `views/profile/` 主页 | 账号安全区显示绑定状态，未绑定传统注册用户给"去绑定"入口 |
| Configs 导入流程 | 捕获 403 `PHONE_REQUIRED_FOR_CLOUD` → `confirm` 弹窗引导跳 `/bind-phone` |

样式遵循现有规范：无渐变、只用 `var(--el-*)`、SVG 图标、SweetAlert 命令式弹窗。

## 四、移动端改动（flutter_app/，Android only）

### 4.1 原生集成
- 根目录 zip 中两个 aar 复制到 `flutter_app/android/app/libs/`：
  - `geetest_captcha_android_v1.8.14_20260804.aar`
  - `auth_number_product-2.14.23-log-online-standard-cuum-release.aar`
- [build.gradle.kts](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/android/app/build.gradle.kts)：加 `libs` flatDir + 两个 `implementation(files(...))`；按阿里云 Demo 清单补权限（`ACCESS_NETWORK_STATE`/`ACCESS_WIFI_STATE`，INTERNET 已有）
- [MainActivity.kt](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/android/app/src/main/kotlin/cn/dstoolkit/dstoolkit_app/MainActivity.kt)：注册 MethodChannel `"dstoolkit/auth"`，四方法：
  - `geetestVerify(captchaId)` → `GTCaptcha4Client.getClient(activity).init(id, config).addOnSuccessListener{...}` → 成功返回 `{lot_number, captcha_output, pass_token, gen_time}`，失败/取消抛 PlatformException（API 参考 zip 内 Example/Docs）
  - `numberAuthCheckEnv` → `PhoneNumberAuthHelper.checkEnvAvailable()` 布尔
  - `numberAuthGetLoginToken(timeoutMs)` → `setAuthListener` + `getLoginToken`（`TokenResultListener.onTokenSuccess` → `TokenRet.fromJson(s).getToken()`）→ 返回 token；用户关闭登录页 → 特定错误码
  - `numberAuthQuit` → `quitLoginPage()`
- 隐私合规：App 首次启动已有协议确认页？若无，一键登录按钮文案注明需同意隐私协议；SDK 默认登录页自带隐私勾选

### 4.2 Dart 层
- 新增 `lib/data/auth/native_auth_bridge.dart`：MethodChannel 封装
- `assets/config` 或常量文件：极验 App captchaId `fd925dfbb79efc2467eb99cd89fcd512`
- [auth_controller.dart](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/lib/features/auth/auth_controller.dart) 新增方法（均复用现有「拿 JWT → OAuth2 PKCE 换 dstk_ 令牌」管线）：
  - `smsSend(phone)`（先极验）、`smsLogin(phone, code)`
  - `numberAuthLogin()`：bridge 拿 token → `POST /auth/number-auth/login`
  - `bindPhone(phone, code)`
- dio 拦截器：捕获 403 `PHONE_REQUIRED_FOR_CLOUD` → go_router 跳绑定流程（或挂全局监听给 Profile 提示条）

### 4.3 UI（[login_page.dart](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/lib/features/auth/login_page.dart)、[profile_page.dart](file:///home/pmfish/Documents/trae_projects/dstoolkit/flutter_app/lib/features/profile/profile_page.dart)）
- 登录页：
  1. 页面加载即 `numberAuthCheckEnv` → 可用则展示主按钮「本机号码一键登录」
  2. 验证码登录（手机号+验证码+60s 倒计时；发送前极验，降级方案）
  3. 保留密码登录/注册 Tab（提交前极验）
- 个人页：手机号绑定入口（未绑定的 USERNAME_PASSWORD 用户显示提示卡），底部弹层完成绑定（极验+短信）

## 五、运营前提（非代码，需在控制台手工完成）
1. 阿里云：开通**号码认证服务**（含短信认证子项）；AccessKey 需 `dypnsapi` 相关权限
2. 号码认证控制台配置 App：包名 `cn.dstoolkit.dstoolkit_app` + 签名 MD5（用根目录 `AppSignGet.apk` 对正式签名包提取）
3. 极验后台确认 Web/App 两对 id-key 均为"启用"状态
4. 测试需真实 SIM 卡（运营商网关一键登录）与已开通服务的手机号段

## 六、验证方案
1. **后端**：`npm run build` 零错误；`prisma:push` 后 sqlite→MySQL schema 生效；tsx 起服务 curl 冒烟：sms/send（极验跳过态）→ 拿到短信 → sms/login 新号自动注册 → /me 显示脱敏手机号；老密码登录带 captcha 字段通过；LEGACY 用户导入不受影响；新传统注册用户导入返回 403 PHONE_REQUIRED_FOR_CLOUD → phone/bind 绑定后 200
2. **Web**：`npm run build`（type-check 零错误）；dev 环境真跑一遍：极验弹窗 → 短信收码登录 → 绑定流程；密码登录+极验
3. **Flutter**：`flutter analyze` 零问题；真机装 APK：一键登录（运营商 UI 弹出→JWT/PKCE 成功）、关网/拔卡降级走短信、密码注册+极验、绑定手机流程

## 七、范围外（明确不做）
- iOS 端（未提供 SDK）
- 号码认证 H5 SDK（用户确认不接入）
- 管理后台展示手机号列（未要求）
- 手机号换绑/解绑（当前仅支持未绑定→绑定）
- 传统注册用户的密码找回（涉及邮箱通道，未要求）
