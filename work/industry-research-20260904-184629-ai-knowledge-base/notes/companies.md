# 重点企业

## 核心判断

AI 知识库赛道的代表企业按"知识组织路线"分化为三类，且商业化成熟度差异显著：结构化工作台叠加 Agent（Notion AI）、AI 原生零结构捕获（Mem.ai）、国内协作套件内嵌知识问答（飞书知识库）。以 Rewind/Limitless 为代表的"全记录式被动记忆"路线已被 Meta 收购并于 2025 年底下线，说明纯记录型记忆尚未跑通独立商业化，但"对话续聊 / 主动记忆"仍是未被主流知识库原生覆盖的功能空白 [1][2][3][4]。

## 代表企业对比

| 企业/产品 | 路线 | 知识组织方式 | 核心 AI 能力 | 目标用户 | 定价（AI 可用档） | 商业化阶段 |
| --- | --- | --- | --- | --- | --- | --- |
| Notion AI | 海外结构化工作台 + Agent | 手动层级 + 数据库，AI 叠加在结构之上 | Ask Notion 跨应用检索、AI Agents、AI 速记、企业搜索；支持 GPT-5 / Claude / o3 多模型 [1][2] | 团队、企业 | Business $20/人/月（AI 含在内）；自定义代理 $10/千积分 [1] | 成熟商业化，企业版 LLM 零数据保留 [1] |
| Mem.ai | 海外 AI 原生零结构 | 单一信息流，AI 自动建连（知识图谱 + 向量检索） | Agentic Chat、Deep Search、Heads Up 主动浮现、Voice Mode、邮件/网页汇入 [3] | 个人、独立知识工作者 | Free 25 条/月；Pro $12/月 [2][3] | Series A（累计 $29M，估值 $110M，2022）；2023 年 ARR $4.2M [3] |
| 飞书知识库 + 飞书 AI | 国内协作套件内嵌 | 企业知识库 + 全域消息/文档 | 知识问答（基于企业全域资料）、智能纪要、aily 智能伙伴、多维表格/文档 AI [5] | 企业、团队 | AI 基础版 18 万点/年起（额度制）[5] | 成熟企业产品（字节跳动） |
| Obsidian（+ AI 插件） | 本地优先 + 插件式 | 本地 Markdown，双链 + 图谱，AI 由插件提供 | Smart Connections 等插件提供语义检索与问答；支持本地/API 模型 [2] | 极客、隐私敏感用户 | 核心免费；商业 $50/人/年 [2] | 成熟个人工具，AI 非原生内置 [2] |
| Rewind / Limitless | 对话续聊 / 被动记忆（已退出） | 被动全记录（屏幕 + 音频 + 对话） | Ask Rewind 问答、会议摘要、跨应用记忆、Pendant 可穿戴转录 [4] | 高频会议知识工作者 | 已停服（关停前 Free / Pro / Unlimited 三档）[4] | 2025 年被 Meta 收购，2025-12-19 停服 [4] |

## 主流海外产品 AI 档月费对比

```chart
title: 海外AI知识库产品AI功能可用档月费
purpose: comparison
type: bar
unit: USD/月
period: 2026年
geography: 全球
property: 实际
source: [1][2]
item: Notion AI (Business) | 20 | $20/人/月 | 实际
item: Mem.ai (Pro) | 12 | $12/月 | 实际
```

## 企业简析

### Notion AI

Notion AI 是结构化工作台阵营的标杆，AI 能力建立在已有的页面/数据库结构之上。商业版（$20/人/月）一次性打包 Notion 代理、AI 速记、企业搜索三大能力，其中企业搜索可跨 Slack、Google Drive、GitHub、Jira 等 10+ 应用检索并带回引 [1]。自定义代理按积分计费（$10/千积分），自 2026 年 5 月 4 日起收费 [1]。模型层支持 GPT-5、Claude Opus 4.1、o3 多模型切换 [2]。Notion 3.0（2025 年 9 月）引入自主 AI Agents，2026 年 5 月推出 Developer Platform 定位 Agent 编排枢纽 [2]。商业化成熟，企业版承诺 LLM 提供商零数据保留，并通过 SOC 2、ISO 27001、HIPAA 合规 [1]。

### Mem.ai

Mem.ai 是 AI 原生零结构路线的代表，2019 年成立，2022 年获 OpenAI Startup Fund 领投的 $23.5M Series A（估值 $110M），累计融资约 $29M，2023 年 ARR 约 $4.2M [3]。2025 年 10 月 1 日发布 Mem 2.0，定位"AI Thought Partner"，重构为本地优先、事件驱动架构，支持全平台离线 [3]。核心差异化在 Agentic Chat（可直接创建/编辑/整理笔记）、Deep Search（三层语义检索）、Heads Up（上下文主动浮现相关笔记）以及邮件转发、Chrome 扩展等零摩擦汇入 [3]。技术栈为知识图谱 + 向量数据库 + Embeddings，依赖 OpenAI 模型，Pro 档 $12/月 [2][3]。壁垒在自动关联体验，但生态与协作弱于 Notion。

### 飞书知识库 + 飞书 AI

飞书知识库是国内协作套件内嵌知识管理的代表，依托字节跳动飞书生态。AI 能力以"飞书 AI 版本"额度制售卖，从基础版 18 万点/年到旗舰版 2000 万点/年，覆盖知识问答（20 点/次）、智能纪要（0.5 点/分钟）、aily 智能伙伴、多维表格 AI、文档 AI、妙搭等 [5]。知识问答可基于企业全域飞书资料（消息、文档、知识库）智能答疑，是国内企业知识库 AI 化最完整的方案之一 [5]。商业化成熟，目标客户为中大型企业。

### Obsidian（+ AI 插件）

Obsidian 是本地优先 + 插件式路线的代表，核心应用免费、商业使用 $50/人/年 [2]。笔记以纯文本 Markdown 存储在本地设备，用户完全拥有数据，支持全平台离线 [2]。AI 能力非原生内置，由 1400+ 社区插件提供，其中 Smart Connections 可基于本地或 API 大模型对笔记库做语义检索与问答 [2]。优势在数据所有权、隐私与插件生态，劣势在 AI 需自行配置、协作能力弱，适合隐私敏感的极客与长期知识管理用户 [2]。

### Rewind / Limitless（记忆路线参考案例）

Rewind 2020 年成立，2022 年 11 月推出 Mac 端本地屏幕/音频录制应用，2023 年 3 月上线 GPT-4 驱动的 Ask Rewind（"ChatGPT for me"），同年发布可穿戴 Pendant [4]。2024 年更名为 Limitless 转向软硬一体，2025 年被 Meta 收购，2025 年 12 月 19 日正式停服 [4]。其路线是"被动全记录式记忆"——记录用户所见所闻并可自然语言检索。该案例说明：全记录式记忆在隐私、存储与付费意愿上未跑通独立商业化，但"对话导入 + 可检索记忆 + 问答"的产品形态对本项目的"续聊 / 记忆"功能有直接参考价值 [4]。

## 参考资料

1. [迎接你的全天候 AI 团队 — Notion AI](https://www.notion.com/zh-cn/product/ai) — Notion 官方，日期不详
2. [Notion AI vs Obsidian vs Mem AI for Personal Knowledge Management](https://thebestaitools.co/comparisons/notion-ai-vs-obsidian-vs-mem-ai-for-personal-knowledge-management/) — The Best AI Tools（Amit Malvi），2026-04-19
3. [Mem AI](https://aiwiki.ai/wiki/mem_ai) — AI Wiki，2026-07-16 更新
4. [What Happened to Rewind AI?](https://rewind.ai/what-happened-to-rewind/) — rewind.ai（现运营方），日期不详
5. [飞书 AI 用量购买说明](https://www.feishu.cn/hc/zh-CN/articles/146539130003) — 飞书帮助中心，2026-05-07
