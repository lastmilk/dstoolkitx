# 当前用户 — GET /api/v1/me

返回当前令牌所属用户的基本信息，常用于验证令牌是否有效。

## 请求

```http
GET /api/v1/me
Authorization: Bearer dstk_xxx
```

无查询参数。

## 响应

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

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user.id` | number | 用户 ID |
| `user.username` | string | 用户名 |
| `user.role` | string | 角色，`USER` 或 `ADMIN` |
| `user.cloudSyncEnabled` | boolean | 是否开启云端存储 |
| `user.createdAt` | string | 注册时间（ISO 8601） |

## 示例

```bash
curl https://<your-host>/api/v1/me \
  -H "Authorization: Bearer dstk_xxx"
```
