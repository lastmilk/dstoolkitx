# 快速开始

dstoolkit 提供一套 RESTful API（`/api/v1/*`），让你能以编程方式读取自己账户下的 Deepseek 会话数据：配置、会话、消息、搜索与统计。

## 基础信息

| 项 | 值 |
| --- | --- |
| 基础地址 | `https://<your-host>/api/v1` |
| 鉴权方式 | `Authorization: Bearer <token>` |
| 令牌格式 | `dstk_` + 48 位十六进制 |
| 响应格式 | `application/json; charset=utf-8` |
| 时间格式 | ISO 8601 (UTC)，如 `2026-08-21T05:59:09.366Z` |

## 第一步：创建访问令牌

1. 登录 dstoolkit 用户端，进入 **个人中心**。
2. 在「RESTful API 访问令牌」卡片中填写名称与有效期，点击 **生成令牌**。
3. 弹窗会显示完整的令牌明文（形如 `dstk_bbe3fd95...`），**请立即复制保存**——关闭后无法再次查看，服务端只存哈希。

## 第二步：发起首个请求

使用令牌调用 `GET /api/v1/me` 验证身份：

```bash
curl https://<your-host>/api/v1/me \
  -H "Authorization: Bearer dstk_your_token_here"
```

成功响应：

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "ADMIN",
    "cloudSyncEnabled": true,
    "createdAt": "2026-08-19T07:02:31.046Z"
  }
}
```

## 第三步：浏览数据

- 列出配置：`GET /api/v1/configs`
- 分页会话：`GET /api/v1/configs/:id/conversations?page=1&pageSize=20`
- 读取单个会话：`GET /api/v1/configs/:id/conversations/:convId`
- 搜索消息：`GET /api/v1/search?q=关键词`

详见 [API 参考](/api/overview)。

## 客户端示例

### Python

```python
import requests

token = "dstk_your_token_here"
headers = {"Authorization": f"Bearer {token}"}
base = "https://<your-host>/api/v1"

# 列出配置
configs = requests.get(f"{base}/configs", headers=headers).json()["configs"]
config_id = configs[0]["id"]

# 搜索
results = requests.get(
    f"{base}/search",
    headers=headers,
    params={"q": "Java", "configId": config_id, "limit": 5},
).json()["results"]
for r in results:
    print(r["title"], "->", r["content"][:40])
```

### Node.js (fetch)

```js
const token = 'dstk_your_token_here'
const base = 'https://<your-host>/api/v1'
const headers = { Authorization: `Bearer ${token}` }

const stats = await fetch(`${base}/stats`, { headers }).then((r) => r.json())
console.log(stats) // { configs, conversations, messages, apiTokens }
```
