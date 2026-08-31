# 会话 — Conversations

会话端点均在 `/api/v1/configs/:id/conversations` 下，按配置（Deepseek 账号）维度组织。

## 分页列表

### GET /api/v1/configs/:id/conversations

返回指定配置下的会话元数据（lite 版，不含 messages），按 `insertedAt` 倒序分页。

```http
GET /api/v1/configs/4/conversations?page=1&pageSize=20
Authorization: Bearer dstk_xxx
```

#### 查询参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 50 | 每页条数（上限 500） |

#### 响应

```json
{
  "records": [
    {
      "id": 123,
      "deepseekConvId": "1b236a2e-f94d-4b02-97d5-e276993ecf9b",
      "title": "JavaFX最小化IDE开发",
      "insertedAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:05:00.000Z",
      "turnCount": 8
    }
  ],
  "total": 9154,
  "page": 1,
  "pageSize": 20
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `records[].deepseekConvId` | string | 会话 ID（后续取详情的路径参数） |
| `records[].title` | string | 会话标题 |
| `records[].turnCount` | number | 该会话的对话轮数 |
| `records[].insertedAt` / `updatedAt` | string | 创建 / 更新时间 |

## 单个会话详情

### GET /api/v1/configs/:id/conversations/:convId

返回单个会话的完整 messages 与聚合后的五层 turns 树（不含 `rawMapping`）。

- `:id` — 配置 ID
- `:convId` — 会话的 `deepseekConvId`（字符串 UUID）

```http
GET /api/v1/configs/4/conversations/1b236a2e-f94d-4b02-97d5-e276993ecf9b
Authorization: Bearer dstk_xxx
```

### 响应

```json
{
  "id": 123,
  "configId": 4,
  "deepseekConvId": "1b236a2e-f94d-4b02-97d5-e276993ecf9b",
  "title": "JavaFX最小化IDE开发",
  "insertedAt": "2026-08-20T10:00:00.000Z",
  "updatedAt": "2026-08-20T10:05:00.000Z",
  "turnCount": 8,
  "messages": [
    {
      "id": 4567,
      "nodeId": "2",
      "parentId": "1",
      "role": "ASSISTANT",
      "model": "deepseek-chat",
      "content": "我来帮您创建一个基于JavaFX的最小化IDE...",
      "insertedAt": "2026-08-20T10:00:05.000Z",
      "turnIndex": 0,
      "versionIndex": 0,
      "subTurnIndex": null
    }
  ],
  "turns": [
    {
      "turnIndex": 0,
      "userNodeId": "1",
      "versions": [
        {
          "versionIndex": 0,
          "assistantNodeId": "2",
          "subTurns": []
        }
      ]
    }
  ]
}
```

### turns 聚合规则

扁平 messages 已带 `turnIndex` / `versionIndex` / `subTurnIndex`，按以下规则聚合成五层树：

| 消息特征 | 归属节点 |
| --- | --- |
| `USER` + 仅有 `turnIndex` | `Turn.userNodeId` |
| `ASSISTANT` + `turnIndex` + `versionIndex` | `Version.assistantNodeId` |
| `USER` + 三者俱全 | `SubTurn.userNodeId` |
| `ASSISTANT` + 三者俱全 | `SubTurn.assistantNodeId` |

## 示例：遍历某配置下的所有会话

```bash
TOKEN=dstk_xxx
BASE=https://<your-host>/api/v1
CONFIG_ID=4

page=1
while :; do
  res=$(curl -s "$BASE/configs/$CONFIG_ID/conversations?page=$page&pageSize=100" \
        -H "Authorization: Bearer $TOKEN")
  echo "$res" | jq -c '.records[].title'
  total=$(echo "$res" | jq '.total')
  page=$((page + 1))
  [ $((page * 100)) -lt "$total" ] || break
done
```
