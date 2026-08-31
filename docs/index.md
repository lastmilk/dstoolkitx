---
layout: home

hero:
  name: dstoolkit
  text: RESTful API 文档
  tagline: 通过 API 令牌以编程方式访问你的 Deepseek 会话数据
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: API 参考
      link: /api/overview

features:
  - title: 令牌鉴权
    details: 个人中心生成 dstk_ 前缀访问令牌，服务端仅存 SHA-256 哈希，明文不落库。
  - title: RESTful 资源
    details: 以资源为中心组织端点：配置、会话、消息、搜索、统计，统一分页约定。
  - title: 分页与过滤
    details: 列表端点统一支持 page / pageSize 分页与关键字过滤，返回 records + total。
  - title: 全文搜索
    details: 内置 SQL LIKE 搜索消息内容与会话标题，无需额外搜索引擎依赖。
---
