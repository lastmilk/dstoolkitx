# 认证与令牌

所有 `/api/v1/*` 端点都需要有效的访问令牌。令牌体系独立于 Web 端登录用的 JWT——API 令牌用于程序化访问，更适合脚本、定时任务与服务端集成。

## 令牌格式

- 前缀：`dstk_`（便于识别与误用检测）
- 主体：24 字节密码学随机数，十六进制编码（48 字符）
- 完整示例：`dstk_bbe3fd95864d864ee29c8f12b8c96ba92cfe9cacb0fed0b4`

## 鉴权方式

在每个请求头中携带：

```
Authorization: Bearer dstk_xxxxxxxx...
```

服务端流程：

1. 取出 `Bearer ` 后的令牌，校验 `dstk_` 前缀与长度。
2. 计算 SHA-256 哈希，在数据库按 `tokenHash` 唯一索引查找。
3. 检查 `expiresAt` 是否过期。
4. 鉴权通过后，**非阻塞**更新 `lastUsedAt`。

## 安全实践

- 令牌明文**仅在创建时返回一次**，服务端只存哈希，无法事后读取。
- 请将令牌视为密码妥善保存，推荐使用环境变量或密钥管理服务，**不要**硬编码进代码库。
- 令牌按用户隔离，仅能访问归属当前用户的数据。
- 可为不同用途创建多个令牌（如「数据采集」「脚本调试」），便于按需吊销。
- 怀疑泄露时，立即在个人中心删除对应令牌，删除后立即失效。

## 错误响应

| 场景 | HTTP 状态 | 响应体 |
| --- | --- | --- |
| 未携带令牌 | 401 | `{"error":"缺少访问令牌，请在个人中心创建 API 令牌后通过 Authorization: Bearer <token> 传入"}` |
| 格式错误（非 dstk_ 前缀） | 401 | `{"error":"令牌格式错误，应以 dstk_ 开头"}` |
| 令牌不存在或已删除 | 401 | `{"error":"令牌无效或已删除"}` |
| 令牌已过期 | 401 | `{"error":"令牌已过期"}` |
| 访问不属于自己的资源 | 404 | `{"error":"配置不存在"}` 等 |

## 令牌管理（Web 端）

令牌的创建、查看列表、删除均在 dstoolkit 用户端「个人中心 → RESTful API 访问令牌」完成（使用 Web 登录 JWT，**不**通过 API 令牌自身管理）：

| 操作 | 方法 | 端点 |
| --- | --- | --- |
| 列出令牌 | GET | `/api/tokens` |
| 创建令牌 | POST | `/api/tokens` |
| 删除令牌 | DELETE | `/api/tokens/:id` |

### 创建令牌

```bash
# 需先用 /api/auth/login 获取 JWT
curl -X POST https://<your-host>/api/tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"数据采集","expiresInDays":90}'
```

响应（`token` 明文仅此一次返回）：

```json
{
  "id": 2,
  "name": "数据采集",
  "token": "dstk_bbe3fd95864d864ee29c8f12b8c96ba92cfe9cacb0fed0b4",
  "prefix": "dstk_bbe3f",
  "createdAt": "2026-08-21T05:59:09.366Z",
  "expiresAt": "2026-11-19T05:59:09.365Z"
}
```

请求体参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1–64 字符，便于识别用途 |
| `expiresInDays` | number | 否 | 1–3650 的正整数；省略则永不过期 |
