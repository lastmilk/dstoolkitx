# 竞争格局

## 核心判断

AI 知识库 / PKM 赛道按"知识组织方式"与"AI 介入深度"分化为三阵营：结构化工作台叠加 AI（Notion AI）、AI 原生零结构捕获（Mem.ai）、本地优先 / 插件式（Obsidian）。对话续聊与长期记忆正从通用大模型内置记忆（Claude、ChatGPT）和独立记忆层（Mem0、Zep、Xtended）两侧渗透，但主流知识库产品对"跨对话续聊"与"主动长期记忆"的原生覆盖仍弱，这是现有云端存储知识库接入大模型的差异化切口 [1][3]。

## 参与者定位与功能矩阵

按研究范围（AI 增强的个人知识管理 / 知识库软件）纳入可比较的产品，覆盖海外 AI 原生知识库、本地优先 / 插件式两类可核实样本。以下维度对"对话导入、续聊、记忆辅助"三项焦点功能做了显式判断 [1][2][3][4][5]。

| 产品 | 阵营 | 知识组织方式 | 对话导入 | 续聊 / 跨会话记忆 | 记忆辅助 | 目标用户 | 定价 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Notion AI | 结构化工作台 + AI | 手动层级 + 数据库，AI 叠加在结构之上 | Ask Notion 跨应用检索（Slack、Drive、Jira、GitHub、Teams、OneDrive、SharePoint、Salesforce、Box），带回引 [1] | 工作区范围内可问答，但对话不跨会话持久化 [1][3] | Meeting Notes 自动纪要；Agent 可在工作区自主执行任务 [1][4] | 团队、企业 | Business $20/人/月（AI 含在内）；Free/Plus 仅试用 AI [1][4] |
| Mem.ai | AI 原生零结构 | 单一信息流，AI 自动建连，无需文件夹 / 标签 | 浏览器剪藏、邮件、PDF 汇入，AI 自动关联 [1][5] | 基于知识图谱语义召回，但不保留独立对话历史 [1][5] | 深度搜索、自动知识图谱、会议简报（Beta）[5] | 个人、独立知识工作者 | Free 25 条/月；Pro $12/月 [1][5] |
| Obsidian（+ AI 插件） | 本地优先 / 插件式 | 本地 Markdown，双链 + 图谱，AI 由插件提供 | Smart Connections、Copilot 等插件实现语义检索与问答 [2][4] | 无原生会话记忆，依赖插件或外部工具 [3] | 插件式写作辅助、语义搜索 [2][4] | 极客、隐私敏感用户 | 核心免费；Sync $4/月；Copilot Plus $14.99/月 [4] |

> Rewind AI（被动记录型记忆产品）于 2025 年 12 月被 Meta 收购，已停止向新用户开放，不作为可比现役产品纳入 [4]。

## 对话续聊与长期记忆：独立赛道正在切入知识库

通用大模型与独立记忆层正在补足知识库的"会话连续性"短板，但其形态与知识库产品分离：ChatGPT Memory 总量约 1200 词且不跨项目 [3]；Claude Memory 采用 CLAUDE.md 文件式、项目范围内记忆，可导入导出 [3]；Mem0（41K GitHub stars、2400 万美元融资）以 SDK 形态为开发者提供记忆层 [3]；Xtended、Zep/Graphiti 等主打跨工具记忆可移植性与时间推理 [3]。这意味着"续聊"能力尚未被主流知识库原生整合，是可切入的功能空白 [3]。

## 主流产品月费对比

```chart
title: 主流AI知识库产品AI功能可用档月费（美元/月）
purpose: comparison
type: bar
unit: USD/月
period: 2026年
geography: 全球
property: 实际
source: [1][4][5]
item: Notion AI (Business) | 20 | $20/人/月 | 实际
item: Mem.ai (Pro) | 12 | $12/月 | 实际
item: Obsidian + Copilot Plus | 14.99 | $14.99/月 | 实际
item: Granola (Business) | 14 | $14/人/月 | 实际
```

## 竞争能力与进入壁垒

- **结构化工作台阵营**（Notion AI）：壁垒在用户基数与协作网络，Notion 自称 3000 万+ 用户生态 [2]；AI 能力建立在已有结构之上，跨应用检索与 Agent 编排是其差异化方向 [1]。
- **AI 原生阵营**（Mem.ai）：壁垒在零摩擦捕获与自动关联体验，但用户社区与生态小于工作台产品 [1][5]。
- **本地优先阵营**（Obsidian）：壁垒在数据所有权与 1000+ 插件生态，但 AI 需用户自行配置插件，门槛较高 [2][3][4]。
- **共性缺口**：跨对话续聊与主动长期记忆尚未被任何主流知识库产品原生覆盖，多依赖外部记忆层或大模型内置记忆 [3]。

## 参考资料

1. [Notion AI vs Mem AI: Which Note App Wins in 2026?](https://awesomeagents.ai/tools/notion-ai-vs-mem-ai-2026/) — Awesome Agents（James Kowalski），2026-05-20
2. [Best AI Knowledge Management Tools](https://aloa.co/ai/comparisons/ai-note-taker-comparison/best-ai-knowledge-management-tools) — Aloa，日期不详
3. [AI Memory Tools Compared: The Complete 2025 Landscape](https://xtended.ai/blog/comparisons/ai-memory-tools-compared) — Xtended，2025-12-16
4. [Best AI Note-Taking Tools in 2026 - 5 Compared](https://awesomeagents.ai/tools/best-ai-note-taking-tools-2026/) — Awesome Agents（James Kowalski），2026-04-25
5. [Mem AI Review: The Personal Knowledge Manager That Thinks With You](https://thebestaitools.co/ai-tool-reviews/mem-ai-review-the-personal-knowledge-manager-that-thinks-with-you/) — The Best AI Tools（Amit Malvi），2026-05-07
