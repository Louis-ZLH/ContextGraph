# RabbitMQ 应用场景方案

## 现有 MQ 使用

- **文件预处理**（`ai.file.convert`）：用户上传文件 → Go publish → ai-service consume → 转换/提取 → 存 MinIO
- 拓扑：`ai_exchange`（topic）→ `file_convert_queue`，已有 DLX/DLQ

---

## 方案一：Canvas 导出 PDF/Markdown（推荐）

### 场景

用户点击"导出画布"，将整个 canvas 的所有对话、文件内容、节点关系打包生成一份可分享的文档（PDF 或 Markdown）。

### 为什么适合 MQ

| MQ 能力 | 匹配度 | 说明 |
|---------|--------|------|
| 持久化 | 需要 | 用户主动触发，期望拿到结果，任务不能丢 |
| 解耦重任务 | 需要 | 大 canvas 导出耗时长（遍历所有 node/conversation/message/file），不能阻塞主服务 |
| 独立扩缩容 | 有价值 | 导出任务 CPU/IO 密集，可独立 scale worker |
| 削峰 | 有价值 | 多用户同时导出时缓冲请求 |

### 流程

```
用户点导出
  → Go 创建 export 任务记录（status=pending），返回 taskID
  → publish MQ: ai_exchange / canvas.export
     payload: { task_id, canvas_id, user_id, format: "pdf"|"markdown" }
  → worker consume:
     1. 查询 canvas 的所有 nodes + edges
     2. 遍历每个 ChatNode → 拉 conversation 的消息链
     3. 遍历每个 ResourceNode → 拉文件内容/摘要
     4. 按拓扑排序组织内容结构
     5. 渲染为 PDF（WeasyPrint / wkhtmltopdf）或拼装 Markdown
     6. 存入 MinIO: exports/{user_id}/{task_id}.pdf
     7. 更新任务记录 status=completed, result_path=...
  → 前端轮询任务状态 / WebSocket 通知
  → 用户点击下载
```

### 需要的改动

**后端（Go）：**
- 新增 `export_task` 表（id, canvas_id, user_id, format, status, result_path, created_at）
- 新增 `POST /api/canvas/:id/export` 接口
- 新增 `GET /api/export/:taskId` 查询导出状态和下载链接
- publish 消息到 `ai_exchange`，routing key `canvas.export`

**Worker（ai-service 或独立服务）：**
- 新增 consumer 绑定 `canvas_export_queue` ← `ai_exchange` / `canvas.export`
- 实现 PDF/Markdown 渲染逻辑

### MQ 练手价值

- 复用现有 `ai_exchange`，练习同一 exchange 下多 queue 多 routing key
- 实现任务状态跟踪（pending → processing → completed/failed）
- 练习 fire-and-forget + 结果回写模式

---

## 方案二：Embedding 生成 + 语义搜索（强烈推荐，产品价值最高）

### 场景

用户在 canvas 里积累了大量对话后，想搜"之前讨论过 Redis 缓存失效的内容在哪个节点"。关键词搜索无法覆盖语义相近但措辞不同的内容，需要向量语义搜索。

### 为什么适合 MQ

| MQ 能力 | 匹配度 | 说明 |
|---------|--------|------|
| 持久化 | 必须 | 丢失索引 = 搜索结果不完整，用户困惑"我明明聊过这个" |
| 高频解耦 | 必须 | 每条 message complete 都要索引，不能耦合在对话流程中 |
| 独立扩缩容 | 必须 | embedding 计算是独立的 CPU/GPU 密集任务 |
| 削峰 | 有价值 | 多用户同时对话时大量 embedding 请求需要缓冲 |

### 流程

```
=== 索引流程（异步）===

assistant message 保存完成后
  → Go publish MQ: ai_exchange / search.index.message
     payload: { message_id, conversation_id, canvas_id, content, role }

文件预处理完成后
  → ai-service publish MQ: ai_exchange / search.index.file
     payload: { file_id, canvas_id, text_content }

embedding worker consume:
  → 调 embedding API（text-embedding-3-small / 本地模型）
  → 生成向量
  → 写入 pgvector 表 / Milvus

=== 搜索流程（同步）===

用户输入搜索词
  → Go 调 embedding API 生成 query 向量（同步，< 200ms）
  → 在向量库中检索 top-k（cosine similarity）
  → 返回匹配的 node + message 片段 + 相关度分数
  → 前端高亮显示对应节点
```

### 需要的改动

**基础设施：**
- PostgreSQL 安装 pgvector 扩展（或引入独立向量数据库）
- 新增 `message_embeddings` 表（message_id, canvas_id, embedding vector, content_preview）

**后端（Go）：**
- SendMessage 的 complete 分支中，publish 索引消息
- 新增 `GET /api/canvas/:id/search?q=xxx` 搜索接口
- 新增 embedding 生成的 HTTP client（调 OpenAI embedding API 或本地服务）

**Worker：**
- 新增 consumer 绑定 `search_index_queue` ← `ai_exchange` / `search.index.*`
- 调用 embedding API + 写入向量库

### MQ 练手价值

- routing key 通配符：`search.index.*` 同时匹配 `search.index.message` 和 `search.index.file`
- 高频消息场景（每条对话都触发），体验 MQ 在高吞吐下的缓冲能力
- 多 producer（Go 发 message 索引，ai-service 发 file 索引）→ 单 consumer 模式

---

## 方案三：Canvas 智能分析（锦上添花）

### 场景

用户 canvas 上有多个 ChatNode 和 ResourceNode，点击"分析画布"，AI 生成：
- 各节点讨论的主题概览
- 跨节点知识关联（"节点 A 的方案和节点 C 的需求有冲突"）
- 未连接但内容相关的节点推荐（"建议将节点 D 连接到节点 B"）

### 为什么适合 MQ

| MQ 能力 | 匹配度 | 说明 |
|---------|--------|------|
| 持久化 | 需要 | 用户主动触发，期望看到结果 |
| 解耦重任务 | 需要 | 需要把整个 canvas 信息喂给 LLM，token 消耗大，耗时长 |
| 重试 | 有价值 | LLM 调用可能因 rate limit 失败，MQ 自动重试 |

### 流程

```
用户点分析
  → Go 创建 analysis 任务记录
  → publish MQ: ai_exchange / canvas.analyze
     payload: { task_id, canvas_id, user_id }
  → ai-service consume:
     1. 通过 Go 内部 API 拉取 canvas 所有 node summaries + 文件摘要
     2. 构造分析 prompt，调大模型
     3. 解析结果（主题列表、关联发现、连接建议）
     4. 回调 Go 内部 API 存储分析结果
  → 前端轮询/通知 → 展示分析报告
```

### 需要的改动

**后端（Go）：**
- 新增 `canvas_analysis` 表（id, canvas_id, result JSON, status, created_at）
- 新增 `POST /api/canvas/:id/analyze` 触发接口
- 新增 `GET /api/canvas/:id/analysis` 查询结果接口
- 新增内部 API `GET /internal/canvas/:id/context` 供 ai-service 拉取数据

**ai-service：**
- 新增 consumer 绑定 `canvas_analyze_queue` ← `ai_exchange` / `canvas.analyze`
- 实现分析 prompt + 结果解析

### MQ 练手价值

- 练习跨服务数据拉取模式（consumer 需要回调 producer 获取数据）
- 练习任务状态机（pending → processing → completed/failed）
- 体验 MQ 重试机制对 LLM rate limit 的天然适配

---

## 方案对比

| | Canvas 导出 | 语义搜索 | 智能分析 |
|---|---|---|---|
| MQ 契合度 | 高 | 极高 | 高 |
| 产品价值 | 高（分享刚需） | 极高（核心差异化） | 中（锦上添花） |
| 实现复杂度 | 中 | 高（需引入向量库） | 中 |
| MQ 练手覆盖面 | 基础（复用已有模式） | 广（通配符、高频、多 producer） | 中（跨服务回调） |
| 建议优先级 | 先做（快速出效果） | 核心功能（长期投入） | 有余力再做 |

## 建议实施顺序

1. **Canvas 导出**：和文件预处理模式一致，最快上手，1-2 天出 MVP
2. **语义搜索**：产品核心能力，需要引入 pgvector，投入更大但价值最高
3. **智能分析**：前两个做完后的锦上添花
