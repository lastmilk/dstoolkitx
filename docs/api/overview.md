# API 总览

所有 API 端点位于 `/api/v1` 前缀下，需通过 [访问令牌](/guide/authentication) 鉴权。

## 端点一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/me` | 当前令牌所属用户信息 |
| GET | `/api/v1/configs` | 列出当前用户的全部配置 |
| GET | `/api/v1/configs/:id/conversations` | 分页返回会话元数据（lite） |
| GET | `/api/v1/configs/:id/conversations/:convId` | 单个会话完整 messages + 聚合 turns |
| GET | `/api/v1/search` | 搜索消息内容与会话标题 |
| GET | `/api/v1/stats` | 当前用户的数据统计 |

## 分页约定

列表端点统一采用以下查询参数：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 1 | 页码，从 1 开始 |
| `pageSize` | number | 50 | 每页条数，上限 500 |

分页响应体结构：

```json
{
  "records": [ /* 当前页数据 */ ],
  "total": 9154,
  "page": 1,
  "pageSize": 20
}
```

## 统一错误格式

所有错误响应均为如下结构，并附带合适的 HTTP 状态码：

```json
{ "error": "错误描述" }
```

常见状态码：

| 状态码 | 含义 |
| --- | --- |
| 200 | 成功 |
| 401 | 未认证 / 令牌无效或过期 |
| 404 | 资源不存在或不属于当前用户 |
| 500 | 服务器内部错误 |
