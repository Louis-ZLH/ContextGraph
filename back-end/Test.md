# 全功能测试清单

> 覆盖三个架构文档的所有测试需求：
> - `chat_canvas_context_sync_plan.md`（Chat 发送携带 Canvas 上下文变更）
> - `file_analysis_architecture_plan.md`（LLM 文件分析功能）
> - `new_conversation_summary_architecture_plan.md`（多层级对话上下文压缩）
>
> **图例：** `[ ]` 待测 | `[x]` 已通过

---

## 一、Chat Canvas 上下文同步

### 1.1 前端 — computeParentDelta 单元测试

- [x] 空 delta 返回空数组
- [x] 新增 edge → newParentNodes 包含完整 Node 数据
- [x] 删除 edge → deletedParentNodeIds 正确填充
- [x] 新建节点 + 新增 edge → 完整 parent node 数据
- [x] 级联删除（节点 + edge）→ 正确处理
- [x] 混合操作（同时 add 和 delete）→ 两个数组各自正确
- [x] 不相关 edge（target 非当前 ChatNode）→ 不影响结果

### 1.2 前端 → 后端 — 请求携带 ParentDelta

- [ ] SendMessage 请求体中包含 `new_parent_nodes` 和 `deleted_parent_node_ids`
- [ ] RetryMessage 请求体中包含 `new_parent_nodes` 和 `deleted_parent_node_ids`
- [ ] 无 delta 时两个字段缺省（不传或空数组），后端正常处理
- [ ] `new_parent_nodes` 中的 Node 格式与 syncCanvas 保持一致（经过 `convertNodeToSendStructure` 转换）

### 1.3 后端 — ParentDelta 合并逻辑

- [x] 无 delta 时走原有逻辑，行为与改动前完全一致
- [x] `new_parent_nodes` 中节点已被 sync 到 DB → 使用 DB 数据，不重复、不冲突
- [x] `new_parent_nodes` 中节点尚未 sync → 使用前端传来的完整数据组装上下文
- [x] `deleted_parent_node_ids` 中的 edge 已被 sync 删除 → 减去操作无副作用（幂等）
- [x] send 和 sync 同时到达 → sync 写库、send 只读，互不干扰

### 1.4 端到端 — 上下文正确性

- [x] 新增 edge 后立刻发消息 → AI 能看到新 parent 的上下文
- [x] 删除 edge 后立刻发消息 → AI 不再看到被删 parent 的上下文
- [ ] send 请求失败 → pendingDelta 未受影响，sync 正常运行
- [x] retry 时修改了 canvas parent 关系 → AI 基于新上下文重新生成
- [x] 旧版前端不传新字段 → 后端正常运行（向后兼容）

---

## 二、文件上传与校验

### 2.1 文件大小与格式校验

- [x] 上传 >5MB 文件 → 被正确拒绝，返回错误信息
- [x] 上传空文件（0 字节）→ 被正确拒绝
- [x] 上传 PDF 超过 3 页 → 被正确拒绝
- [x] 上传 PPTX 超过 5 页 → 被正确拒绝
- [x] 上传文本文件（text/\*、json）超过 50KB → 被正确拒绝
- [x] 上传 DOCX 文本量超过 50KB → 被正确拒绝（通过 ZIP 读 `word/document.xml` 估算）
- [x] 上传 XLSX 文本量超过 50KB → 被正确拒绝（通过 ZIP 读 `xl/sharedStrings.xml` 估算）
- [x] 上传旧版 Office 格式（.doc / .xls / .ppt）→ 被拒绝，返回提示用户转为新版格式
- [x] 上传不在白名单内的文件扩展名 → 被正确拒绝

### 2.2 图片上传压缩

- [x] 上传宽度 >1568px 的图片 → 压缩到最大宽度 1568px
- [x] 压缩后图片格式为 JPEG，quality=80
- [x] 上传宽度 ≤1568px 的图片 → 不放大，保持原尺寸或仅格式转换
- [x] 压缩后的图片成功存入 MinIO

### 2.3 文件绑定

- [x] 文件上传后能成功绑定到 ResourceNode（BindFileToNode）
- [x] 文件所有权校验 → 非文件上传者无法绑定/下载

---

## 三、异步文件预处理（ai-service）

### 3.1 RabbitMQ 消息投递

- [x] 文件上传成功后，Go 后端同时 SET `file:wait_to_process:{file_id}` 和 `file:processing:{file_id}`（TTL=5min）
- [x] Go 后端成功 Publish 消息到 `ai_exchange`，routing key `ai.file.convert`
- [x] 消息体包含 `file_id`、`minio_path`、`content_type`

### 3.2 ai-service 消费者

- [x] 消费者正确接收 `file_convert_queue` 中的消息
- [x] 消费者检查 `file:wait_to_process` key → key 不存在时直接 ACK 跳过（幂等）
- [x] 处理成功后 DEL `file:processing` + DEL `file:wait_to_process` → ACK
- [x] 处理失败后 DEL `file:processing` + DEL `file:wait_to_process` → reject（进入 DLQ）
- [x] prefetch_count=1 → 同一时间只处理一条消息

### 3.3 各文件类型预处理

- [x] **PDF（文本充足）**：PyMuPDF 提取文本 → 写入 `_text.txt`
- [x] **PDF（扫描件 / 文本不足）**：PyMuPDF 逐页渲染为图片 → 写入 `_pages/page_N.jpg`
- [x] **DOCX**：python-docx 提取文本 → 写入 `_text.txt`
- [x] **XLSX**：openpyxl 提取为 Markdown table → 写入 `_text.txt`
- [x] **PPTX**：LibreOffice headless 导出 PDF → PyMuPDF 逐页渲染 → 写入 `_pages/page_N.jpg`
- [x] 转换出的图片统一压缩（1568px，JPEG q=80）
- [x] 提取的文本超过 50KB 时截断，末尾追加 `[...文本已截断]` 标记

### 3.4 异步 Summary 生成

- [x] 文件转换完成后，文本量 >10KB → 异步调用 LLM 生成摘要 → 写入 `_summary.txt`
- [x] 文本量 ≤10KB → 跳过 summary 生成
- [x] summary 生成失败 → 不影响主流程（文件已可用，退化到 `_text.txt`）
- [x] summary 生成在 DEL `file:processing` 之后执行 → 不阻塞聊天

---

## 四、上下文组装 — 文件内容注入

### 4.1 原始类型文件

- [x] **text/\*、application/json** → Redis 缓存命中时直接用；miss 时从 MinIO 读原文件 → 写 Redis → 用
- [x] **image/\*** → 直接从 MinIO 取图片 → 转 base64 → 注入为 image_url content block
- [x] Redis `file:text_cache:{file_id}` TTL=24h 正确设置

### 4.2 转换类型文件

- [x] 检查 `file:processing:{file_id}` 锁 → 有锁时轮询等待（500ms 间隔，最大 5s）
- [x] 锁等待超时 → 返回错误并中止请求
- [x] 锁释放后，按优先级取用：`_summary.txt` → `_text.txt` → `_pages/`
- [x] summary 尚未生成时正确退化到 `_text.txt`
- [x] summary 生成完成后再次聊天 → 正确使用 summary
- [x] `_text.txt` 也不存在时退化到 `_pages/`（仅 PPTX 和扫描 PDF）
- [x] 以上均无 → 返回错误「文件解析异常，请重新上传文件」
- [x] Redis `file:summary_cache:{file_id}` 和 `file:text_cache:{file_id}` 的 hit/miss 逻辑正确

### 4.3 文件内容注入格式

- [x] ResourceNode 文件内容以 content block 注入 parent context（fake first turn）
- [x] ChatNode summary 和 ResourceNode 文件内容混合为同一个 user message 的 content blocks
- [x] 末尾追加 text block「以上是本次聊天的前置知识」
- [x] 没有父节点时跳过 fake first turn

---

## 五、多层级对话上下文压缩

### 5.1 Message-level Summary — 上下文组装

- [x] 沿 parent 链遍历时，遇到非空 summary 且到当前消息 ≥3 轮 raw → 使用 summary + raw messages
- [x] 遇到 summary 但 <3 轮 raw → 跳过该 summary 继续向上
- [x] 遍历到 root 都没找到可用 summary → 使用全部原始消息
- [x] 有可用 summary 时，构造 fake second turn（`user: "之前的对话摘要：..."` + `assistant: "好的..."`)
- [x] 无 summary 时跳过 fake second turn
- [x] 多 branch edge case：Branch A 生成的 summary 被 Branch B 找到但 <3 轮 → 正确跳过

### 5.2 Message-level Summary — 触发与生成

- [x] Token 估算超过 threshold（`(128K - parentContextTokens) * 0.75`）时触发
- [x] 完整轮次 < `SUMMARY_OFFSET_ROUNDS + 1`（默认 3 轮）时不触发
- [x] 有 Redis 锁（正在生成中）时不重复触发
- [x] 触发后异步生成（goroutine），本轮请求不等待
- [x] Summary 挂载位置正确：当前轮往上退 2 轮的 assistant message
- [x] 挂载时跳过空的 assistant 消息（error/aborted 状态）
- [x] 生成输入：上次 summary + 上次 summary 之后到挂载位置的 raw messages
- [x] 生成成功 → 写入 DB（message.summary 字段）→ 删除 Redis 锁
- [x] 生成失败 → 仅删除 Redis 锁、打日志，不影响后续请求
- [x] 60s 超时控制（`context.WithTimeout`）

### 5.3 Message-level Summary — 锁与并发

- [x] 进入组装前 GET 检查 Redis 锁 → 锁存在则阻塞等待（500ms 轮询，最多 15s）
- [x] 等待超时 → fallback 到只保留最近 3 轮 raw messages
- [x] 锁释放后从 DB 读取新写入的 summary → 正确使用
- [x] SET NX 加锁 → 仅一个请求成功加锁，其余请求跳过触发
- [x] Redis 锁 TTL=90s 兜底 → 进程崩溃后锁自动过期

### 5.4 Node-level Summary — 缓存与生成

- [x] 查询父节点 conversation 的 `CurrentLeafID`
- [x] 父节点 conversation 不存在或 `leafID == rootMessageID` → 跳过 node summary
- [x] Redis key `summary:node_level:{conversation_id}:{leaf_id}` hit → 直接使用
- [x] Cache miss → SET NX 加锁 → 加锁成功 → 同步生成 → 写入缓存 → 删除锁
- [x] 加锁成功后 double-check 缓存 → 缓存已存在则跳过生成（避免重复 AI 调用）
- [x] 加锁失败 → 轮询等待缓存 key 出现（500ms 间隔），超时由 assemblyTimer 控制
- [x] Node summary 生成输入：最深 message-level summary + 其后的 raw messages
- [x] 无 message-level summary 时直接用全部 raw messages
- [x] 使用 `summary_type = "node"` 调用 ai-service

### 5.5 Node-level Summary — 失效与 TTL

- [x] 父节点有新消息写入 → leaf_id 变化 → 旧缓存不再命中 → 触发重新生成
- [x] 父节点用户切换 branch → leaf_id 变化 → 新 branch 有缓存则命中，否则重新生成
- [x] Redis TTL=1h → 长时间无变化后自动清理
- [x] Redis 重启 → 缓存丢失 → 下次引用时同步重新生成

---

## 六、并发执行与超时体系

### 6.1 assemblyTimer（30s）

- [x] Step 2（injectParentContext）和 Step 3（buildMessageChain）并发执行
- [x] 两者均在 30s assemblyTimer 的 context 控制下
- [x] 任一步骤超时 → 返回错误，提示用户重试
- [x] 多父节点的处理在 goroutine 中并发执行（ChatNode + ResourceNode 各自独立）

### 6.2 firstTokenTimer（30s）

- [x] 上下文组装完成后才启动 firstTokenTimer
- [x] 收到 AI 首 token 后停止 timer
- [x] 超时未收到 → 取消 AI 请求，返回超时错误

### 6.3 两阶段超时互不侵占

- [x] assemblyTimer 结束后才发起 AI 调用和 firstTokenTimer
- [x] 上下文组装耗时 20s → firstTokenTimer 仍有完整 30s

---

## 七、硬截断保护

- [x] Step a：丢弃最早的 raw messages（至少保留最近 1 轮）
- [x] Step b：截断 parent context（按节点创建时间倒序，最早的先裁）
- [x] Step c：仍超标 → 返回 400 错误（`hardTruncate` 返回 error，调用方发送 SSE error 事件）
- [x] Token 估算使用 `tokenutil`（ASCII / 非 ASCII 二分法 + 图片 1600 tokens/张）
- [x] 截断基于 `128K * 0.80` 上限（为模型输出预留 20%）
- [x] Step 5（summary 触发判断）基于未截断的原始 token 计数，不受 Step 6 硬截断约束

---

## 八、SSE 事件

### 8.1 后端 SSE 事件发送

- [x] `summarizing`（reason: `node_summary`）：ChatNode cache miss 同步生成时发送
- [x] `summarizing`（reason: `file_processing`）：ResourceNode 文件处理等待时发送
- [x] `summarizing`（reason: `message_summary`）：message-level 锁等待时发送
- [x] `thinking`：上下文组装完成后、AI 调用前发送
- [x] `user_message`：用户消息保存成功后发送
- [x] `token`：AI 生成 token 时逐个发送
- [x] `complete`：AI 生成完成时发送
- [x] `error`：错误时发送
- [x] `retry_ack`：retry 请求验证通过后发送

### 8.2 前端 SSE 事件处理

- [x] 收到 `summarizing` → 显示对应 reason 的提示文案
- [x] 收到 `thinking` → 切换到 thinking 动画
- [x] 收到 `token` → 流式渲染 AI 回复
- [x] 收到 `complete` → 完成消息渲染
- [x] 收到 `error` → 显示错误信息
- [x] 多个 `summarizing` 事件并发到达 → 显示最新一条文案

---

## 九、ai-service 多模态支持

### 9.1 消息格式兼容

- [x] 纯文本消息（`content: string`）→ 所有 provider 正常处理
- [x] 多模态消息（`content: list[ContentBlock]`）→ 正确分流

### 9.2 各 Provider 适配

- [x] **OpenAI**：原生支持 `image_url` 格式，无需转换
- [x] **Claude**：`image_url` block → `{"type": "image", "source": {"type": "base64", ...}}`
- [x] **Gemini**：`image_url` block → `Part(inline_data=Blob(...))`
- [x] **DeepSeek**：不支持多模态 → 图片 blocks 被正确过滤/跳过

### 9.3 Summary 生成端点

- [x] `POST /api/generate-summary` 正确接收 `messages`、`previous_summary`、`summary_type`
- [x] `summary_type = "message"` → 使用 message-level prompt 模板
- [x] `summary_type = "node"` → 使用 node-level prompt 模板
- [x] 使用 utility model（小模型）生成，降低成本

---

## 十、跨模块集成测试

### 10.1 完整聊天流程（无父节点）

- [x] 创建 Canvas → 创建 ChatNode → 创建 Conversation → 发送消息 → 收到 AI 回复
- [x] 消息保存到 DB，状态从 pending → done
- [x] CurrentLeafID 正确更新

### 10.2 完整聊天流程（有 ChatNode 父节点）

- [x] ChatNode A 有对话 → 创建 ChatNode B → 建立 edge A→B → B 发送消息
- [x] B 的上下文包含 A 的 node summary（fake first turn）
- [x] A 继续对话后，B 再次发送 → A 的 node summary 自动刷新（leaf_id 变化 → cache miss → 重新生成）

### 10.3 完整聊天流程（有 ResourceNode 父节点）

- [x] 上传文件 → 创建 ResourceNode → 绑定文件 → 建立 edge ResourceNode→ChatNode → ChatNode 发送消息
- [x] 文本文件：上下文包含文件文本内容
- [x] 图片文件：上下文包含 base64 image content block
- [x] PDF 文件：上下文包含提取的文本或转换的图片
- [x] DOCX 文件：上下文包含提取的文本
- [x] XLSX 文件：上下文包含 Markdown table 格式的文本
- [x] PPTX 文件：上下文包含逐页渲染的图片

### 10.4 Canvas 同步 + Chat 竞态

- [x] 修改 canvas（添加/删除 edge）→ 2s debounce 期间立刻发消息 → ParentDelta 正确携带
- [x] sync 和 send 同时到达后端 → 数据一致，无竞态问题
- [x] send 失败后 → delta 未被消费 → sync 正常推进

### 10.5 长对话 Summary 全流程

- [x] 持续对话至 token 超过 threshold → message-level summary 被触发
- [x] 下次请求 → 等待 summary 完成 → 使用 summary + 最近几轮 raw messages
- [x] 继续对话 → 新 summary 基于上次 summary + 中间 raw messages 增量生成
- [x] 整个过程中 AI 回复质量不因上下文压缩而显著下降

### 10.6 混合父节点（ChatNode + ResourceNode）

- [x] 同时有 ChatNode 和 ResourceNode 作为父节点 → 两者上下文混合注入同一个 fake first turn
- [x] ChatNode summary 为 text block，ResourceNode 文件为 text 或 image_url block → 格式正确
- [x] 多个父节点并发处理 → 所有父节点上下文均被收集

### 10.7 Retry 场景

- [x] 普通 retry（无 canvas 修改）→ 重新组装上下文，正常重新生成
- [x] 修改 canvas 后 retry → 携带新的 ParentDelta → AI 基于新上下文重新生成
- [x] retry 时 message-level summary 重新计算

---

## 十一、基础设施健壮性

### 11.1 RabbitMQ

- [x] ai-service 和 Go 后端双方幂等声明 exchange/queue → 启动顺序无关
- [x] 连接断开 → 自动重连
- [x] 消息处理失败 → reject → 进入 DLQ

### 11.2 Redis

- [x] Redis key TTL 兜底 → 进程崩溃后锁/key 自动过期
- [x] 文本缓存 TTL=24h → 过期后自动清理
- [x] Node summary 缓存 TTL=1h → 过期后自动清理

### 11.3 MinIO

- [x] 文件上传路径规范：`users/{user_id}/{uuid}_{filename}`
- [x] 预处理产物路径规范：`_text.txt`、`_pages/`、`_summary.txt`
- [x] 文件下载正确返回 Content-Type 和 Content-Disposition

### 11.4 用户输入限制

- [x] 后端 `SendMessageRequest` 校验 `Content` 长度 ≤ 15,000 字符
- [x] 前端输入框限制最大字符数 → 超出禁用发送

---

## 十二、向后兼容

- [x] 旧版前端不传 `new_parent_nodes` / `deleted_parent_node_ids` → 后端正常运行
- [x] ai-service `content` 字段接受 `string` 或 `list[ContentBlock]` → 纯文本消息向后兼容
- [x] 无父节点的 ChatNode → 跳过 fake first turn，行为与改动前一致
- [x] 无 message-level summary 的短对话 → 使用全部 raw messages，行为与改动前一致
