# 搜索 — GET /api/v1/search

在当前用户的消息内容与会话标题中做关键词搜索（SQL `LIKE`，无额外搜索引擎依赖）。结果按 `insertedAt` 倒序。

## 请求

```http
GET /api/v1/search?q=Java&configId=4&limit=20
Authorization: Bearer dstk_xxx
```

### 查询参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `q` | string | 是 | — | 关键词，匹配消息内容与会话标题 |
| `configId` | number | 否 | — | 限定在某个配置范围内搜索 |
| `limit` | number | 否 | 50 | 返回上限（1–500） |

::: tip
`q` 为空时返回空结果。搜索基于 SQL `LIKE`，使用 `%keyword%` 模糊匹配，对中文同样适用。
:::

## 响应

```json
{
  "results": [
    {
      "convId": "1b236a2e-f94d-4b02-97d5-e276993ecf9b",
      "nodeId": "2",
      "title": "JavaFX最小化IDE开发",
      "content": "我来帮您创建一个基于JavaFX的最小化IDE，支持Java代码高亮...",
      "role": "ASSISTANT",
      "turnIndex": 0,
      "versionIndex": 0,
      "subTurnIndex": null
    },
    {
      "convId": "abc-123",
      "nodeId": "title:abc-123",
      "title": "Java 并发编程",
      "content": "Java 并发编程",
      "role": "TITLE",
      "turnIndex": null,
      "versionIndex": null,
      "subTurnIndex": null
    }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `results[].convId` | string | 所属会话 ID |
| `results[].nodeId` | string | 命中的消息节点 ID；标题命中时为 `title:<convId>` |
| `results[].role` | string | `USER` / `ASSISTANT` / `TITLE` |
| `results[].turnIndex` 等 | number \| null | 用于在会话树中定位 |

::: tip 标题命中
当会话标题本身包含关键词时，会额外返回一条 `role: "TITLE"` 的结果，便于直接按标题定位会话。
:::

## 示例

```bash
curl "https://<your-host>/api/v1/search?q=React&limit=10" \
  -H "Authorization: Bearer dstk_xxx"
```

按配置范围搜索并仅显示标题：

```bash
curl -s "https://<your-host>/api/v1/search?q=Java&configId=4&limit=20" \
  -H "Authorization: Bearer dstk_xxx" | jq '.results[] | .title'
```
