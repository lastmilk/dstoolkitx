# 统计 — GET /api/v1/stats

返回当前用户的数据规模统计，适合做仪表盘或健康检查。

## 请求

```http
GET /api/v1/stats
Authorization: Bearer dstk_xxx
```

无查询参数。

## 响应

```json
{
  "configs": 1,
  "conversations": 9154,
  "messages": 20263,
  "apiTokens": 1
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `configs` | number | 当前用户的配置数 |
| `conversations` | number | 当前用户的会话总数 |
| `messages` | number | 当前用户的消息总数 |
| `apiTokens` | number | 当前用户的活跃令牌数 |

## 示例

```bash
curl https://<your-host>/api/v1/stats \
  -H "Authorization: Bearer dstk_xxx"
```
