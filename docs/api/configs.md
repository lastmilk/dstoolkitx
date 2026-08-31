# 配置 — GET /api/v1/configs

列出当前用户名下的全部 Deepseek 配置（按更新时间倒序）。

## 请求

```http
GET /api/v1/configs
Authorization: Bearer dstk_xxx
```

无查询参数。

## 响应

```json
{
  "configs": [
    {
      "id": 4,
      "name": "测试",
      "deepseekUserId": "31b1c3ba-45a7-49a0-b396-e8e9e84a9dfd",
      "deepseekEmail": "lastmilk@outlook.com",
      "deepseekMobile": "+86 18913609240",
      "conversationCount": 9154,
      "createdAt": "2026-08-20T04:06:04.998Z",
      "updatedAt": "2026-08-20T12:22:10.604Z"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 配置 ID，后续端点以此为路径参数 |
| `name` | string | 配置名称 |
| `deepseekUserId` | string | Deepseek 账号 UUID |
| `deepseekEmail` | string \| null | 邮箱 |
| `deepseekMobile` | string \| null | 手机号 |
| `conversationCount` | number | 该配置下的会话总数 |
| `createdAt` / `updatedAt` | string | 创建 / 更新时间 |

## 示例

```bash
curl https://<your-host>/api/v1/configs \
  -H "Authorization: Bearer dstk_xxx"
```

获取首个配置的 ID 以便后续查询会话：

```bash
CONFIG_ID=$(curl -s https://<your-host>/api/v1/configs \
  -H "Authorization: Bearer dstk_xxx" \
  | jq '.configs[0].id')
```
