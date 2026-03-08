# 多层级对话上下文压缩 — 架构设计 & TODO Plan

## 一、整体架构概述

本项目的对话系统包含两个维度的上下文关系：

1. **Message 级别（节点内）**：单个对话节点内的消息以树结构存储（多 branch），每条 message 记录 `parent_id`
2. **Node 级别（节点间）**：不同对话节点之间通过 `node_edges` 表建立关联（`source_id` → `target_id`），形成节点级别的有向图。父节点可以是 **ChatNode**（对话节点）或 **ResourceNode**（文件节点），两者通过统一的 `node_edges` 遍历，但上下文获取方式不同

为了确保发给 LLM API 的 prompt 不超过 context window 限制，同时保留足够的上下文信息，系统采用两层 summary 机制：

- **Message-level Summary**：压缩单个节点内的对话历史，挂载在 message 表中
- **Node-level Summary**：压缩整个 ChatNode 的对话内容，缓存在 Redis 中，供子节点跨节点引用

> **ResourceNode 不走 summary 机制**：ResourceNode 提供的是文件内容（文本或图片 base64），由 Go 后端直接获取并注入上下文，具体逻辑见 `file_analysis_architecture_plan.md`。本文件仅关注 ChatNode 的 summary 压缩机制，但在上下文组装时会统一处理两种父节点类型。

### 发送给 API 的最终上下文结构

```
[system prompt]                                    ← ai-service 内部注入，Go 不管

① 父节点上下文（fake first turn，如有父节点）
  user:  [content blocks]
           - ChatNode 父节点 → text block（node summary，从 Redis 取）
           - ResourceNode 父节点 → text block（文件文本）或 image_url block（文件图片）
           - 末尾追加 text block："以上是本次聊天的前置知识"
  assistant: "好的，我已了解以上前置知识。"

② 早期对话 summary（fake second turn，如有）
  user:  "之前的对话摘要：..."                      ← 当前节点的 message-level summary（从 MySQL 取）
  assistant: "好的，我已了解之前的对话内容。"

③ 最近若干轮 raw messages                           ← 当前节点最近几轮原始消息

④ 当前用户输入
```

> **说明：** 父节点上下文以 fake user turn 注入，因为 image content blocks 只能放在 user 消息中（大部分 LLM 的 system message 不支持图片）。没有父节点时跳过 ①，没有 summary 时跳过 ②。

---

## 二、Message-level Summary 详细设计

### 2.1 数据库变更

**message 表新增字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `summary` | TEXT, nullable | 摘要内容，覆盖从 root 到该 message 所在位置（含）的全部信息。summary 挂载在哪条 message 上，就覆盖到哪里，无需额外字段记录范围 |

### 2.2 上下文组装逻辑

用户发送消息时，后端在**当前节点内**执行以下流程：

1. 从当前消息沿 parent 链向上遍历，收集所有消息
2. 遍历过程中检查每个节点的 `summary` 字段
3. 遇到非空 summary 时，检查该节点到当前节点之间的 raw message 轮数
   - 如果 ≥ 3 轮：使用该 summary + 剩余 raw messages，停止向上遍历
   - 如果 < 3 轮：**跳过该 summary**，继续向上遍历寻找更早的 summary

   > **多 branch edge case：** Branch A 在第 13 轮触发 summary，挂在了共享祖先路径的第 10 轮上。用户切到 Branch B，而 Branch B 从第 11 轮分叉且尚在第 12 轮，那 Branch B 往上找到第 10 轮的 summary 时中间只有 1 轮 raw。此时跳过该 summary 继续向上找。概率极低，但作为防御性逻辑保留。

4. 如果遍历到 root 都没找到可用 summary（或没有 summary），则使用全部原始消息

### 2.3 Summary 生成触发机制

**触发时机：** 用户发起 send 请求时

**触发条件：**
- Go 端在组装上下文时进行粗略 token 估算（ASCII 字符 `asciiBytes/4`，非 ASCII 字符 `nonASCIIRunes*1.5`，图片按 1600 tokens/张）
- 动态计算阈值：`threshold = (128K - parentContextTokens) * 0.75`
  - 128K：所有模型的最小上下文窗口（GPT-4o、DeepSeek 均为 128K），按最小的算保证所有模型安全
  - `parentContextTokens`：① 所有父节点上下文的估算 token 总量，包括 ChatNode 的 node summary **和** ResourceNode 的文件内容（文本按字符估算，图片按 1600 tokens/张）
  - 0.75 系数为模型输出预留 25% 空间
- 当 ②+③+④（summary + raw messages + 当前用户输入）的 token 量 > threshold 时触发
- 当前 parent 链上的完整轮次数 ≥ `SUMMARY_OFFSET_ROUNDS + 1`（`SUMMARY_OFFSET_ROUNDS` 初始值 2，即至少 3 轮），确保「退 N 轮」有合法的挂载目标。不足时跳过 summary 生成，由 Step 6 硬截断保护兜底
- 通过 Redis 检查当前 conversation 没有正在进行的 summary 生成任务

**执行方式：** 异步触发 + 后续请求阻塞等待（混合策略）

每次请求的 message-level 上下文组装分为三步（对应 Section 四 Step 3 + Step 5）：

1. **锁前置检查**：进入组装前先 GET 检查 Redis 锁，锁存在则阻塞等待释放（500ms 轮询，最多 15s），确保拿到最新 summary
2. **统一组装**：从当前消息沿 parent 链向上遍历，查找可用 summary，拼装 summary + raw messages（无论是否等过锁，组装逻辑一致）
3. **后置触发判断**：组装完毕后进行 token 计数，超过 threshold 且无进行中任务时，SET NX 加锁，启动 goroutine 异步生成 summary；本轮直接用已组装的 context 发送

**为什么采用混合策略而非纯异步或纯同步：**

| | 触发请求延迟 | 后续请求延迟 | 超标 context 请求数 | 实现复杂度 |
|--|------------|------------|-------------------|----------|
| 纯异步 | 无 | 无 | 可能多次 | 低 |
| 纯同步 | +5~15s | +5~15s | 0 | 低 |
| **异步+阻塞（采用）** | **无** | **+0~15s** | **最多 1 次** | **中** |

- 进入组装前先 GET 检查锁：只要有 summary 正在生成，就等它完成后再组装，确保拿到最新的 summary
- 触发者不需要等：它已经组装好 context，summary 覆盖范围不包含本轮消息，等了也用不上
- 最多只有一次超标请求（触发者那一次），之后的请求都能用上 summary

> **工业界参考：** 面向终端用户的聊天产品（Mem0、ChatGPT）主流采用异步/离线生成；框架层（LangChain ConversationSummaryBufferMemory）默认同步阻塞；长时间运行的 Agent（Factory.ai）采用同步。本项目的混合策略结合了异步的低延迟和同步的上下文安全性。

**Step 1 — 锁前置检查 + 统一组装**

```go
lockKey := fmt.Sprintf("conversation:message_level:gen_summary:%s", conversationID)
exists, _ := redisClient.Exists(ctx, lockKey).Result()

// 1. 锁前置检查：有锁就等
if exists > 0 {
    if err := waitForSummaryReady(ctx, lockKey, 15*time.Second); err != nil {
        // 超时兜底：只保留最近 3 轮 raw messages + 当前用户输入
        log.Printf("[summary] wait timeout for conversation %s, fallback to recent messages only", conversationID)
        messages = keepRecentRounds(rawMessages, 3)
        return messages // 跳过后续组装和触发
    }
}

// 2. 统一组装：无论是否等过锁，组装逻辑一致
messages = assembleContext(...) // 沿 parent 链遍历，查找可用 summary，拼装 summary + raw messages

// 3. 后置触发判断
if shouldTriggerSummary(tokenCount, threshold) {
    ok, _ := redisClient.SetNX(ctx, lockKey, targetMsgID, lockTTL).Result()
    if ok {
        go func() { ... }() // Step 2 — 异步生成 summary
    }
    // SET NX 失败说明另一个请求抢先触发了，无需处理
}
```

**Step 2 — 触发者异步生成 summary**

```go
go func() {
    bgCtx := context.Background()
    defer redisClient.Del(bgCtx, lockKey) // 无论成功失败都释放锁

    // 用带超时的 context 控制 HTTP 调用（summary 生成建议 60s 超时）
    callCtx, cancel := context.WithTimeout(bgCtx, 60*time.Second)
    defer cancel()

    summary, err := s.ai.GenerateSummary(callCtx, summaryInput)
    if err != nil {
        log.Printf("[summary] generation failed for conversation %s: %v", conversationID, err)
        return
    }

    if err := s.conversationRepo.UpdateMessageSummary(bgCtx, targetMsgID, summary); err != nil {
        log.Printf("[summary] db write failed for message %d: %v", targetMsgID, err)
    }
}()
// 继续用已组装的 raw messages 发送本轮请求
```

`waitForSummaryReady` 通过轮询 Redis key 是否消失来判断 summary 是否生成完成（500ms 轮询间隔，最多等 15s）。锁释放后从 DB 读取新写入的 summary。超时后 fallback 到只保留最近 3 轮 raw messages + 当前用户输入，确保不会无限挂起。

**超时设计 — assemblyTimer 与 firstTokenTimer 解耦：**

上下文组装（message-level 锁等待 + node-level summary 同步生成）和 AI 首 token 等待是两个独立阶段，各自有不同的延迟特征。将它们拆分为两个独立的超时计时器，互不侵占预算：

1. **assemblyTimer**：限制上下文组装阶段的总耗时（包括 message-level 锁等待 + node-level summary 同步生成）。使用 `context.WithTimeout` 实现，超时后直接返回错误（用户建立了父节点连线即表示需要该上下文，静默丢弃会导致 AI 回答质量下降且用户无感知，30s 超时说明有实际异常）
2. **firstTokenTimer**：限制 AI 首 token 等待，逻辑与现有代码一致（30s），仅在 AI 调用发起后开始计时

```
assemblyTimer（30s）             firstTokenTimer（30s）
├── message-level 锁等待 ≤15s    ├── AI 首 token 等待
├── node-level summary 生成      └── 超时则取消 AI 请求
└── 超时则返回错误取消请求。
```

```go
// === assemblyTimer：上下文组装阶段 ===
assemblyCtx, assemblyCancel := context.WithTimeout(ctx, 30*time.Second)
defer assemblyCancel()

// eventCh 传入组装函数，内部检测到阻塞时按需发送 summarizing 事件
// Step 2 和 Step 3 并发执行
var wg sync.WaitGroup
var parentContext []ContentBlock  // Step 2 结果
var messageChain []ChatMessage    // Step 3 结果
var parentErr, messageErr error

wg.Add(2)
go func() {
    defer wg.Done()
    parentContext, parentErr = s.injectParentContext(assemblyCtx, ..., eventCh)  // Step 2
}()
go func() {
    defer wg.Done()
    messageChain, messageErr = s.buildMessageChain(assemblyCtx, userMsg.ID, eventCh)  // Step 3
}()
wg.Wait()

if parentErr != nil || messageErr != nil {
    eventCh <- dto.SSEEvent{Type: "error", Data: dto.ErrorData{Message: "上下文组装超时，请稍后重试"}}
    return
}

// Step 4: 合并为最终 prompt
chatMessages := mergePrompt(parentContext, messageChain, currentUserInput)

// === firstTokenTimer：AI 首 token 阶段（逻辑不变） ===
eventCh <- dto.SSEEvent{Type: "thinking"}  // 前端从 summarizing 切换到 thinking
aiCh, err := s.ai.StreamChat(aiCtx, chatMessages, req.Model)
firstTokenTimer := time.AfterFunc(30*time.Second, func() { ... })
```

3. **SSE 状态事件：**

**`summarizing` — 按需触发，区分原因：**

`summarizing` 事件不是每次请求都发送，仅在检测到实际阻塞时由组装函数内部触发。三种触发场景对应不同的 Data，前端可据此显示不同提示文案：

| 事件 | 触发场景 | Data | 前端提示（建议） |
|------|----------|------|-----------------|
| `summarizing` | Node-level summary cache miss，需同步生成 | `{"reason": "node_summary"}` | "正在整理关联节点上下文..." |
| `summarizing` | ResourceNode 文件正在转换，等待 processing 锁释放 | `{"reason": "file_processing"}` | "正在等待文件处理完成..." |
| `summarizing` | Message-level summary 正在生成，等待锁释放 | `{"reason": "message_summary"}` | "正在整理对话历史..." |
| `thinking` | 上下文组装完成，进入 AI 调用阶段 | — | 切换到 thinking 动画 |

```go
// 在 injectParentContext 内部，ChatNode cache miss 时：
if cacheMiss {
    eventCh <- dto.SSEEvent{Type: "summarizing", Data: SummarizingData{Reason: "node_summary"}}
    summary = generateNodeSummary(...)  // 同步阻塞
}

// 在 injectParentContext 内部，ResourceNode 等待文件处理时：
if processing {
    eventCh <- dto.SSEEvent{Type: "summarizing", Data: SummarizingData{Reason: "file_processing"}}
    waitForProcessing(...)
}

// 在 buildMessageChain 内部，message-level 锁存在时：
if lockExists {
    eventCh <- dto.SSEEvent{Type: "summarizing", Data: SummarizingData{Reason: "message_summary"}}
    waitForSummaryReady(...)
}
```

> 多个阻塞可能并发发生（Step 2 和 Step 3 并行），前端可能收到多个 `summarizing` 事件，显示最新一条的文案即可。无阻塞时不发送任何 `summarizing` 事件，用户无感知。

**为什么不用 MQ / Worker Pool：**
- Summary 生成是 fire-and-forget，失败无后果（下次 send 时重新触发即可）
- Redis SET NX 锁已保证每个 conversation 同时只有一个 summary 任务，不会出现 goroutine 泄漏
- 全局并发量可控，不需要额外的队列或 worker 限制

**HTTP 超时说明：**
- 现有 `AIClient.httpClient` 超时为 10s（用于 generate-title 等快接口），summary 生成需要更长时间
- 方案：在协程内通过 `context.WithTimeout(bgCtx, 60*time.Second)` 单独控制超时，不修改全局 httpClient

**本轮对话处理：** 使用已组装好的原始消息正常发送，summary 生成完成后供下一轮使用

### 2.4 Summary 生成逻辑

**「退 N 轮」的精确定义：** 从触发的 user 消息沿 parent 链回溯，跳过 N 个完整的 (user, assistant) 轮次对，挂载到跳过后遇到的第一个 assistant message 上。即 `挂载轮次 = 触发轮次 - N - 1`。

**输入：**
```
上一次的 summary（如果有） + 从上次 summary 之后到「当前节点往上退 2 轮」的 raw messages
```

**输出：** 一段压缩后的摘要文本

**挂载位置：** 写入「当前节点往上退 2 轮」的那个 assistant message 的 `summary` 字段。退 2 轮 + 当前轮 = 下次请求时至少 3 轮 raw messages，从写入时即保证不触发跳过逻辑。

> **短对话 edge case：** 若对话完整轮次 < `SUMMARY_OFFSET_ROUNDS + 1`（`SUMMARY_OFFSET_ROUNDS` 初始值 2，即至少 3 轮），「退 N 轮」的目标节点不存在（例如 Round 3 user 触发时，退 2 轮落在不存在的 Round 0）。此时不生成 summary，由 Step 6 硬截断保护兜底。随着对话增长到足够轮次后 summary 自然生效。

**例子：**
```
  第6轮：
    user:
    assistant:   -->这个节点挂载了summary_6
  第7轮
  第8轮
  第9轮
  第10轮
    user:
    assistant:    <-把summary_10 回挂在这里
  第11轮
    user:
    assistant:
  第12轮
    user:
    assistant:
  第13轮
    user:         -->触发合成summary_10(用summary_6 + 7,8,9,10轮的raw messages合成)。

  第14轮:
    user:         -->此时可以保证携带至少三轮raw messages(11,12,13轮完整的raw messages + 第14轮当前用户输入)
```

**摘要模型选择：** 使用更便宜、更快的小模型（如 Haiku），不用主对话模型，降低成本和延迟。

### 2.5 并发控制（Redis）

**Redis Key：** `conversation:message_level:gen_summary:{conversation_id}`

**Value：** 正在生成 summary 的目标 message_id（string）

**流程（对应 Section 四 Step 3 + Step 5）：**
1. **锁前置检查**：进入组装前先 `GET` 检查该 key，存在则阻塞等待释放（轮询 500ms，最多 15s）
2. **统一组装**：锁释放后（或本身不存在），执行统一的上下文组装逻辑
3. **后置触发**：组装完毕后，触发条件满足 → 对该 key 执行 `SET NX`（仅在不存在时设置）+ TTL 兜底 → 成功则启动异步生成
4. Summary 生成完成后写入 DB，**主动删除 Redis key**
5. TTL 仅作为兜底保护：当进程崩溃、网络异常等情况导致未能主动删除时，key 自动过期释放锁

---

## 三、Node-level Summary 详细设计

### 3.1 概述

Node-level Summary 用于解决跨节点的上下文传递问题。当节点 B 通过 `node_edges` 引用父节点 A 时，B 需要了解 A 的对话内容。直接将 A 的 raw messages 塞入 B 的 prompt 会导致信息量不可控，因此只传递 A 的 node summary。

### 3.2 存储方案

**仅存 Redis，不写 MySQL。**

Node summary 是派生数据，可随时从 message-level summary + raw messages 重新生成。Redis TTL + key 设计已天然解决失效问题，无需额外维护 MySQL 一致性。

**Redis Key：** `summary:node_level:{conversation_id}:{leaf_id}`

**Value：** node summary 文本（string）

**TTL：** 1 小时

### 3.3 leaf_id 的含义

`leaf_id` 是当前节点内用户所在 branch 的最深消息 ID，它本质上是该节点对话状态的版本号：

- 新消息写入 → leaf_id 变化 → 自动 cache miss → 需要重新生成
- 用户切换 branch → leaf_id 变化 → 但如果目标 branch 之前缓存过且未变化，直接命中
- 用户未操作 → leaf_id 不变 → cache hit，直接复用

### 3.4 Node Summary 生成逻辑

**内容来源：**

复用已有的 message-level summary，避免重新扫描整棵消息树：

```
node summary = summarize(最深的 message-level summary + 该 summary 之后的 raw messages)
```

如果该节点对话很短，连 message-level summary 都没触发过，则直接对所有 raw messages 做一次总结。

**摘要模型选择：** 同 message-level summary，使用小模型（如 Haiku）。

### 3.5 生成时机 — 懒生成 + 同步阻塞

**触发点：** 当子节点组装 context 时，发现父节点缺少 node summary（Redis cache miss）

**跳过条件：** 若父节点对应的conversation不存在或者conversation的 `leaf_id == rootMessage_id`，说明该 ChatNode 没有任何实际对话内容，直接跳过，不生成 node summary。

**执行方式：同步阻塞生成。** 与 message-level summary 的异步策略不同，node summary 必须同步等待，原因：

- 父节点上下文是当前节点无法从自身消息中恢复的信息
- 缺少父节点 context 会导致回答质量显著下降
- 前端收到 `summarizing` 事件（reason: `node_summary`）后显示"正在整理关联节点上下文..."，用户体验可接受

**流程（对应 Section 四 Step 2，与 Step 3 message-level 组装并发执行）：**
1. 用户在节点 B 发送消息
2. 查 `node_edges` 拿到 B 的所有父节点 `[A1, A2, ...]`
3. 对每个父节点启动一个 goroutine，**按节点类型分流**：
   - **ResourceNode** → 跳过 summary 机制，走文件内容获取流程（见 `file_analysis_architecture_plan.md`）
   - **ChatNode** → 走 node summary 流程：
     a. 实时查询该 ChatNode 父节点的 conversation 的 current leaf_id
     b. 构造 Redis key `summary:node_level:{conversation_id}:{leaf_id}`，尝试读取
     c. Cache hit → 直接使用
     d. Cache miss → 用 `SET NX` 对生成锁 `node_summary:gen_lock:{conversation_id}:{leaf_id}` 加锁（TTL 90s）：
        - 加锁成功 → 同步调用小模型生成 node summary，写入 Redis 缓存 key，主动删除锁 key
        - 加锁失败 → 说明另一个请求正在生成，轮询等待缓存 key 出现（500ms 间隔），搭同一趟车
        - 超时由外层 assemblyTimer（30s `context.WithTimeout`）统一控制，无需单独设置
4. `sync.WaitGroup.Wait()` 等待所有父节点 goroutine 完成，收集结果

> 多个父节点的处理互相独立，goroutine 并发可显著降低多 cache miss 场景的延迟。每个 goroutine 内部对 cache miss 的处理仍是同步阻塞的（父节点上下文不可省略）。SET NX 锁保证同一个父节点的 node summary 不会被多个子节点重复生成，后到的请求等待先到者的结果即可。所有阻塞操作的超时均由 assemblyTimer 统一兜底，不再各自设独立超时。

### 3.6 失效机制

基于 `leaf_id` 的自然失效，无需显式的 write-invalidate：

| 场景 | 行为 |
|------|------|
| 父节点有新消息写入 | leaf_id 变化 → 旧 key 不再被查询 → 自然失效 |
| 父节点用户切换 branch | leaf_id 变化 → 如果新 branch 有缓存则命中，否则重新生成 |
| 父节点长时间无变化 | TTL 1h 到期后自动清理，下次引用时重新生成 |
| Redis 重启 | 所有缓存丢失，下次引用时同步重新生成，代价可控 |

---

## 四、完整的 Context 组装流程

用户在节点 B 发送消息时，后端按以下步骤组装 prompt：

```
─── assemblyTimer 开始（30s，context.WithTimeout）───
    （eventCh 传入下方组装函数，检测到阻塞时按需发送 summarizing 事件）

1. 查 node_edges：SELECT * FROM node_edges WHERE target_id = B.node_id
   → 得到父节点列表 [A1, A2, ...]

─── 以下 Step 2 和 Step 3 并发执行，用 sync.WaitGroup 等待全部完成后进入 Step 4 ───

2. 收集 parent context（goroutine 组，并发处理所有父节点）：
   对每个父节点A_i 启动一个 goroutine，按节点类型分流：

   ■ ChatNode → 走 Node-level Summary 机制：
     a. 查询 父节点A_i 的 conversation 的 current leaf_id, 如果该父节点的conversation不存在 或者 current leaf_id == rootMessage_id, 则跳过不管。否则继续以下流程。
     b. 尝试从 Redis 读取 summary:node_level:{A_i.conversation_id}:{leaf_id}
     c. Cache hit → 直接使用
     d. Cache miss → SET NX 加锁 `node_summary:gen_lock:{conversation_id}:{leaf_id}`（TTL 90s）：
        - 加锁成功 → 同步调用小模型生成 node summary，写入 Redis 缓存 key，主动删除锁 key
        - 加锁失败 → 轮询等待缓存 key 出现（500ms 间隔），超时由 assemblyTimer 统一控制
     e. 收集为 text content block

   ■ ResourceNode → 走文件内容获取（详见 file_analysis_architecture_plan.md）：
     a. 根据文件 ContentType 区分原始类型 / 转换类型
     b. 原始文本类 → Redis 缓存 / MinIO 取文本 → text content block
     c. 原始图片类 → MinIO 取图片 → image_url content block
     d. 转换类型 → 检查 processing 锁 → 按 summary→txt→page 优先级取用
     e. 收集为 text 或 image_url content block

   > 多个父节点的处理互相独立，goroutine 并发可显著降低多 cache miss 场景的延迟。

3. 组装当前节点内的 context（Message-level，与 Step 2 并发）：
   a. 进入组装前先 GET 检查 Redis 锁，锁存在则阻塞等待释放（500ms 轮询，最多 15s）；超时则跳过 summary，fallback 到只保留最近 3 轮 raw messages + 当前用户输入
   b. 从当前消息沿 parent 链向上遍历，查找可用的 message-level summary，拼装 summary + raw messages

─── sync.WaitGroup.Wait()：等待 Step 2 所有 goroutine + Step 3 全部完成 ───
─── assemblyTimer 结束。超时则返回错误，提示用户重试 ───

4. 合并为最终 prompt（fake turn 结构，具体格式见第一节）：
   [system prompt]
   ① 父节点上下文 fake turn（ChatNode summary + ResourceNode 文件内容混合为 content blocks）
   ② 早期对话 summary fake turn（如有 message-level summary）
   ③ 最近若干轮 raw messages
   ④ 当前用户输入

5. Token 计数 & 触发 message-level summary 生成（异步，在硬截断前基于原始 token 计数判断）
   - 计算 parentContextTokens（来自 Step 2 结果）
   - threshold = (128K - parentContextTokens) * 0.75
   - 当 ②+③+④ 的 token 量 > threshold 且无进行中的 summary 任务，
     且完整轮次 ≥ SUMMARY_OFFSET_ROUNDS + 1 时，SET NX 加锁，启动 goroutine 异步生成
   > **⚠️ 关键：Step 5 的判断基于未截断的原始 token 计数，不受 Step 6 硬截断的约束。**
   > ②+③+④ 的原始值随对话增长无上界，因此无论 parentContextTokens 多大，
   > threshold 多小，只要对话足够长，summary 一定会被触发。
   > 不要将 Step 6 硬截断后的 token 上限（`128K * 0.80 - P`）误认为是 Step 5 判断时
   > ②+③+④ 的上界——Step 5 在 Step 6 之前执行，使用的是裁剪前的原始值。
   >
   > 此外，锁在 AI 调用前设置，后续请求在 Step 3 更容易看到锁，缩小并发超标窗口。

6. 硬截断保护（发送前最终检查）：
   totalTokens = estimate(①+②+③+④)
   maxAllowed = 128K * 0.80  // 为模型输出预留 20%

   context = ①parentContext + ②message_level_summary + ③raw_message + ④用户当前prompt

   if totalTokens > maxAllowed，按以下优先级逐步裁剪，直到 totalTokens ≤ maxAllowed：
     a. 丢弃最早的 raw messages（③ 从前往后裁，至少保留最近 1 轮）
     b. 仍超标 → 截断 parent context：按父节点关联时间倒序（最早关联的先裁），
        逐个移除 ① 中的 content blocks
     c. 仍超标 → 返回业务错误（前端输入框 + 后端 API 均已限制单条消息长度，
        正常流程不会走到这里；触发即为异常请求，直接返回 400 错误）
   a/b 级裁剪静默执行，用户无感知

─── firstTokenTimer 开始（30s，time.AfterFunc，逻辑与现有代码一致） ───
─── 发送 SSEEvent{Type: "thinking"}，前端从 summarizing 提示切换到 thinking 状态 ───

7. 调用 AI 获取 stream，消费 token 事件
   - 收到首个 token 后停止 firstTokenTimer
   - 超时未收到 token 则取消 AI 请求，返回超时错误
```

**两阶段超时设计：**

| 阶段 | 计时器 | 超时值 | 覆盖范围 | 超时处理 |
|------|--------|--------|----------|----------|
| 上下文组装 | assemblyTimer | 30s | message-level 锁等待 + node-level summary 生成 + 文件内容获取 | 返回错误，提示用户重试 |
| AI 首 token | firstTokenTimer | 30s | AI 模型首 token 响应 | 取消 AI 请求，返回超时错误 |

两个 timer 串行启动、互不侵占。assemblyTimer 结束后才发起 AI 调用、启动 firstTokenTimer。

---

## 五、TODO 清单

> **图例：** ✅ 已完成 | ⏳ 部分完成 | ❌ 未开始
>
> **已完成的基础设施：**
> - ✅ `Conversation` model 含 `CurrentLeafID`，可实时获取任意节点的 leaf_id（`conversationRepo.GetConversationByID`）
> - ✅ `canvasRepo.GetParentNodesByTargetID` 已实现父节点查询（通过 node_edges）
> - ✅ `resolveParentContext` 已实现跨节点上下文组装框架（ResourceNode 分支完整，ChatNode 分支为 `continue` 占位）
> - ✅ `injectParentContext` 已实现 fake first turn 注入，ParentDelta 合并逻辑完整
> - ✅ `buildMessageChain` 已实现沿 parent 链回溯（当前返回全部 raw messages，待改造支持 summary）
> - ✅ 前端 SSE 已预留 `summarizing` 事件处理分支（`chat.ts:127`，当前为 TODO 注释）
> - ✅ ai-service 已有 `stream_chat` 和 `generate_title`，LLM 多模型调用基础设施就绪

### Phase 1：基础设施准备

- [x] **message 表新增字段**：`summary`（TEXT, nullable），执行 migration
  - 涉及文件：`internal/model/message.go`、`internal/migrate/migrate.go`
- [x] **移除 `model.Summary` 表**：当前 DB 中的 Summary model（`internal/model/summary.go`，nodeID 唯一索引）与设计不符——node-level summary 应仅存 Redis，不写 MySQL。需从 model、migrate 中移除
- [x] **封装 token 估算工具函数**：按 ASCII / 非 ASCII 二分法估算，不需要引入 tiktoken 或做语言检测
  - ASCII 字符（`r < 128`，英文、代码、标点）：`asciiBytes / 4`
  - 非 ASCII 字符（`r >= 128`，中日韩、阿拉伯、西里尔等所有多字节文字）：`nonASCIIRunes * 1.5`
  - 图片：1600 tokens/张
  - 建议新建 `pkg/tokenutil/estimate.go`
- [x] **ai-service 新增摘要生成端点** `POST /api/generate-summary`：接收消息列表，调用小模型（utility model）生成摘要文本返回
  - 涉及文件：`ai-service/routers/chat.py`、`ai-service/services/llm.py`、`ai-service/models/schemas.py`
- [x] **Go AIClient 新增 `GenerateSummary` 方法**：调用 ai-service 的 `/api/generate-summary`，使用独立 60s 超时的 context（不修改全局 httpClient）
  - 涉及文件：`internal/infra/aiClient.go`，同时更新 `conversationService` 的 `ai` interface
- [x] **Redis key 规范落地**：
  - Message-level summary 锁：`conversation:message_level:gen_summary:{conversation_id}`，TTL 90s
  - Node-level summary 缓存：`summary:node_level:{conversation_id}:{leaf_id}`，TTL 1h
  - Node-level summary 生成锁：`node_summary:gen_lock:{conversation_id}:{leaf_id}`，TTL 90s
  - 在 `conversationRepo` 或新建 `summaryRepo` 中封装读写方法
- [x] **单条用户消息长度限制**：
  - 后端：`SendMessageRequest` 校验 `Content` 长度，超出返回 400
  - 前端：输入框限制最大字符数（如 1.5w 字符），超出禁用发送并提示

### Phase 2：两层 Summary 核心逻辑（串行流程，功能完整）

> **目标：** 两层 summary 在**串行流程**中完整可用。不引入并发改造和 SSE，先让逻辑跑通。
> 此阶段结束后，SendMessage 仍是串行执行（先 buildMessageChain 再 injectParentContext），没有 loading 提示但功能正确。

**Message-level 部分：**

- [x] **改造 `buildMessageChain`**（`conversationService.go:774`）：
  - 沿 parent 链遍历时检查每个 message 的 `summary` 字段
  - 遇到非空 summary 且到当前消息 ≥ 3 轮 raw → 使用 summary + raw messages，停止遍历
  - < 3 轮 raw → 跳过该 summary 继续向上
  - 有可用 summary 时，构造 fake second turn 注入（`user: "之前的对话摘要：..."` + `assistant: "好的..."`)
- [x] **实现 `waitForSummaryReady`**：轮询 Redis key 是否消失（500ms 间隔，最多 15s）；超时 fallback 到只保留最近 3 轮 raw messages
- [x] **锁前置检查**：在 `buildMessageChain` 入口先 GET 检查 Redis 锁，锁存在则调用 `waitForSummaryReady` 阻塞等待

**Node-level 部分：**

> 已有基础：`resolveParentContext` 已完成 ResourceNode 分支，ChatNode 分支当前为 `continue`（`conversationService.go:524`）

- [x] **补完 ChatNode 分支**（`resolveParentContext` 内）：
  - 查询父节点 conversation 的 `CurrentLeafID`（已有 `GetConversationByID`）
  - 构造 Redis key `summary:node_level:{conversation_id}:{leaf_id}`
  - Cache hit → 直接作为 text content block
  - Cache miss → SET NX 加锁 `node_summary:gen_lock:{conversation_id}:{leaf_id}`（TTL 90s）：
    - 加锁成功 → 同步调用 `ai.GenerateSummary` 生成 node summary，写入 Redis 缓存 key，主动删除锁 key
    - 加锁失败 → 轮询等待缓存 key 出现（500ms 间隔），超时暂用固定 30s，Phase 3 统一替换为 assemblyTimer
- [x] **Node summary 生成输入组装**：查询父节点 conversation 内最深的 message-level summary + 其后的 raw messages，作为 summary 生成的输入
  - 如果该节点无 message-level summary，则直接用全部 raw messages

**触发 + 保护：**

- [x] **后置触发判断**：组装完毕后计算 token 总量（此时 parentContextTokens 已可从 injectParentContext 结果获取），超过 `threshold = (128K - parentContextTokens) * 0.75` 时 SET NX 加锁，启动 goroutine 异步生成
- [x] **异步 summary 生成 goroutine**：
  - `context.WithTimeout(bgCtx, 60s)` 控制超时
  - 调用 `ai.GenerateSummary`
  - 成功后写入 DB（目标 message 的 summary 字段），主动删除 Redis 锁 key
  - 失败则仅删除锁 key、打日志
- [x] **硬截断保护（Step 6）**：合并 prompt 后进行 token 总量检查，超过 `128K * 0.80` 时按优先级裁剪：
  - a. 丢弃最早的 raw messages（至少保留最近 1 轮）
  - b. 截断 parent context（按关联时间倒序移除）
  - c. 仍超标 → 返回 400 错误

### Phase 3：并发优化 + 超时体系 + SSE 事件 + 前端

> **目标：** 在 Phase 2 功能正确的基础上，优化**性能**和**用户体验**。
> 核心逻辑不变，只改编排方式：串行→并发，无超时→统一超时，无反馈→SSE 状态提示。
> 唯一需要改 Phase 2 代码的地方是函数签名（加 `eventCh` / `ctx` 参数），属于机械性改动，不涉及业务逻辑变更。

- [x] **Step 2 + Step 3 并发执行**：用 `sync.WaitGroup` 让 `injectParentContext`（Step 2）和 `buildMessageChain`（Step 3）并发执行
  - 当前代码是串行：先 `buildMessageChain` 再 `injectParentContext`（`conversationService.go:167-174`）
- [x] **goroutine 并发处理多父节点**：`resolveParentContext` 中遍历 `parentMap` 改为每个父节点启 goroutine + `sync.WaitGroup` 并发
- [x] **assemblyTimer（30s）**：用 `context.WithTimeout` 包裹整个组装阶段，超时返回错误；替换 Phase 2 中 Node-level 部分的固定 30s 超时
- [x] **SSE `summarizing` 事件发送**：修改 `buildMessageChain` 和 `resolveParentContext` 签名加入 `eventCh`，在检测到阻塞时按需发送，3 种 reason：
  - `node_summary`：ChatNode cache miss 同步生成时
  - `file_processing`：ResourceNode 文件处理等待时（当前 `waitForProcessing` 已存在，需补发事件）
  - `message_summary`：message-level 锁等待时
- [x] **SSE `thinking` 事件发送**：组装完成后、AI 调用前发送，前端从 summarizing 切换到 thinking
- [x] **前端处理 `summarizing` 事件**：当前 `chat.ts:127` 为 TODO 注释，需补充 UI 状态切换逻辑（显示对应 reason 的提示文案）
- [x] **前端处理 `thinking` 事件**：`chat.ts` 的 SSE switch 中需新增 `thinking` case，收到后将 UI 状态从 summarizing 提示切换到 thinking 动画

### Phase 4：摘要 Prompt 工程

- [x] 设计 message-level summary 的 prompt 模板（输入：上次 summary + raw messages → 输出：压缩摘要）
  - 涉及文件：`ai-service/services/llm.py`（`_MESSAGE_LEVEL_SUMMARY_PROMPT`）
  - 侧重对话延续性：保留核心需求、决策结论、技术细节、未解决问题、上下文事实
  - 目标压缩比 1/5~1/3，省略 assistant 推导过程只保留结论
- [x] 设计 node-level summary 的 prompt 模板（输入：最深 message summary + 尾部 raw messages → 输出：节点摘要）
  - 涉及文件：`ai-service/services/llm.py`（`_NODE_LEVEL_SUMMARY_PROMPT`）
  - 侧重跨节点背景概要：突出讨论主题、最终结论/产出、关键事实、未完成事项
  - 不超过 500 字，省略探索性来回细节
- [x] 明确摘要需要保留的信息类型：用户核心需求、关键决策、未解决问题、重要上下文事实
  - 两种 prompt 各自按优先级排列需保留的信息类型（见 prompt 中的 "Information to Preserve" 段落）
- [x] 确定摘要输出的格式规范（纯文本、结构化 Markdown 等）
  - 格式：自然语言段落，仅用「·」分隔并列要点；禁止标题/编号列表/引用块等 Markdown 格式
  - 代码片段仅在关键时保留；同语言输出（summary 语言跟随原对话语言）
- [x] API 层添加 `summary_type` 字段区分两种摘要类型
  - 涉及文件：`ai-service/models/schemas.py`、`ai-service/routers/chat.py`、`internal/infra/aiClient.go`、`internal/service/conversationService.go`
  - message-level 调用传 `"message"`，node-level 调用传 `"node"`

### Phase 5：可配置参数 //不做，硬编码即可

- [ ] `SUMMARY_OFFSET_ROUNDS`：summary 挂载位置的回退轮数（初始值 2，保证下次请求时有 3 轮 raw）
- [ ] `MIN_CONTEXT_WINDOW`：所有模型的最小上下文窗口（初始值 128K tokens），用于计算 summary 触发阈值
- [ ] `SUMMARY_MODEL`：用于生成摘要的模型（对应 ai-service 的 utility model，如 DeepSeek）
- [ ] `REDIS_SUMMARY_LOCK_TTL`：message-level summary 生成锁的过期时间（初始值 90s）
- [ ] `NODE_SUMMARY_CACHE_TTL`：node-level summary 缓存的过期时间（初始值 1h）
- [ ] `ASSEMBLY_TIMEOUT`：上下文组装阶段超时（初始值 30s）
- [ ] `MSG_SUMMARY_WAIT_TIMEOUT`：message-level 锁等待超时（初始值 15s）

### Phase 6：测试 & 监控

- [ ] 单元测试：`buildMessageChain` 改造后的逻辑（含多 branch、多层 summary、跳过 summary、fallback 全量 raw 等场景）
- [ ] 单元测试：node-level summary 生成与缓存逻辑（cache hit/miss、leaf_id 变化、多父节点并发等场景）
- [ ] 单元测试：token 估算工具函数（中英文混合、图片计数）
- [ ] 单元测试：触发条件判断、Redis 并发控制（SET NX、锁等待、TTL 过期）
- [ ] 集成测试：端到端长对话，验证 message-level summary 的生成 → 写入 → 下次请求使用 → 跳过逻辑
- [ ] 集成测试：跨节点 context 组装，验证 ChatNode summary + ResourceNode 文件内容混合注入
- [ ] 集成测试：并发请求同一 conversation，验证 Redis 锁的互斥和阻塞等待
- [ ] 添加日志：每次 summary 生成记录耗时、输入输出 token 数、压缩比、触发原因

### Phase 7：后续优化（V2）

- [ ] 分角色差异化压缩：assistant 长回复只保留结论，tool call 结果只保留关键字段
- [ ] Memory 提取：从对话中抽取结构化关键事实，注入 system prompt
- [ ] Summary 质量评估：用 LLM-as-judge 对比压缩前后回复一致性
- [ ] Parent context 智能选择：当父节点过多时，用 embedding 相似度排序，取 top-k 最相关的父节点 summary
- [ ] Parent context 预算控制：设 `MAX_PARENT_CONTEXT_TOKENS` 阈值，超过时对所有父节点 summary 进行二次压缩

---

## 六、关键设计决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| **两层 Summary 架构** | Message-level + Node-level | Message-level 处理节点内压缩，Node-level 处理跨节点上下文，职责分离 |
| **Message Summary 语义** | 覆盖从 root 到当前节点的全部内容 | 查找时遇到即可停止，逻辑简单 |
| **Message Summary 挂载位置** | 当前节点往上退 2 轮的 assistant 节点 | 退 2 轮 + 当前轮 = 下次请求时 3 轮 raw，从写入时保证不触发循环 |
| **Message Summary 触发** | 锁前置检查 → 统一组装 → 后置触发判断（Section 四 Step 3 + 5） | 锁检查是组装前置条件，有锁就等；组装逻辑始终一致；触发者不阻塞（summary 不覆盖本轮）；最多只有一次超标请求 |
| **Message Summary 并发控制** | Redis GET 检查 + SET NX 加锁 + 主动删除 + TTL 兜底 | GET 前置检查确保所有请求都感知到进行中的 summary 任务；SET NX 保证不重复触发 |
| **Node Summary 存储** | 仅 Redis，不写 MySQL | 派生数据，可随时重新生成；Redis TTL + leaf_id 天然解决失效 |
| **Node Summary 缓存 Key** | `summary:node_level:{conversation_id}:{leaf_id}` | leaf_id 作为版本号，自然失效，无需显式 invalidate |
| **Node Summary 生成时机** | 懒生成，子节点需要时才触发 | 避免为从未被引用的节点浪费 token |
| **Node Summary 生成方式** | goroutine 并发 + 各自同步阻塞 + SET NX 去重（Section 四 Step 2） | 多父节点并发处理降低延迟；单个 goroutine 内 cache miss 同步等待，父节点上下文不可省略；SET NX 锁防止多个子节点对同一父节点重复生成，后到者轮询等待复用结果 |
| **Node Summary 内容来源** | 复用 message-level summary + 尾部 raw messages | 避免重新扫描整棵消息树，高效 |
| **父节点 leaf_id 获取** | 实时查询父节点 conversation 的 current leaf_id | 实时追踪最新状态，而非建立关联时的快照 |
| **Raw 轮数不足时** | 跳过 summary 继续向上找 | 减少信息重复，逻辑干净；超限情况由 Step 6 硬截断保护兜底，组装层不再额外处理 |
| **短对话不触发 Summary** | 完整轮次 < `SUMMARY_OFFSET_ROUNDS + 1` 时跳过 | 「退 N 轮」目标节点不存在，无法挂载；由 Step 6 硬截断保护兜底，对话增长后自然生效 |
| **摘要模型** | 小模型（如 Haiku） | 降低成本和延迟 |
| **ResourceNode 不走 summary** | 直接获取文件内容注入上下文 | ResourceNode 提供的是静态文件内容，无需压缩；具体获取逻辑见 `file_analysis_architecture_plan.md` |
| **父节点上下文注入方式** | Fake user turn（content blocks 数组） | image blocks 只能放在 user 消息中，fake turn 统一处理 ChatNode summary 和 ResourceNode 文件内容 |

---

## 七、Bug 待修复

### Bug 1（逻辑缺失）: `hardTruncate` 缺少 Step c 返回 400 错误 // fixed

**文档要求：** `c. 仍超标 → 返回 400 错误`

**现状：** `hardTruncate`（`conversationService.go:1220`）在步骤 a（裁 raw messages）和步骤 b（裁 parent context blocks）之后，即使仍然超标也直接返回 `chatMessages`，没有任何错误信号。调用方（`SendMessage`/`RetryMessage`）也未检查截断后是否仍超标。

**影响：** 极端情况下可能将超长 prompt 发给 AI API，导致 API 端 400 或 context overflow。

**修复方案：** `hardTruncate` 改为返回 `([]infra.ChatMessage, error)`，超标时返回 error，调用方发送 400 SSE error 事件。

---

### Bug 2（注释误导）: `maybeTriggerSummary` 中的注释与实际逻辑不匹配 // fixed

**现状：** `conversationService.go:1147` 注释写"倒数第 5 条是 target assistant"，但倒数第 5 条实际上是一个 **user** 消息。以 `rawMessages = [u1, a1, u2, a2, u3, a3, u4, a4, u5]` 为例：倒数第 5 条是 `u3`（index 4），不是 assistant。

**代码逻辑本身正确：** `targetIdx` 并非 target 的索引，而是 `summaryInput` 的切片上界（`rawMessages[:targetIdx]` 包含到 target assistant 为止）。`asyncGenerateMsgSummary` 中通过 `stepsToTarget` 回溯找到的 `targetMsgID` 确实是正确的 assistant 消息。

**修复方案：** 更正注释：
```go
// targetIdx 是 summaryInput 的切片上界，rawMessages[:targetIdx] 包含到挂载目标 assistant 为止。
// 挂载目标 = 从末尾回退 (summaryOffsetRounds*2+1) 步的前一个位置，即 rawMessages[targetIdx-1]。
```

---

### Bug 3（与文档不一致）: parent context blocks 裁剪顺序不可控 // fixed（粗略，实际效果接近：节点创建越早，被关联的时间通常也越早，绝大多数场景下两者顺序一致）

**文档要求：** `b. 截断 parent context：按关联时间倒序（最早关联的先裁），逐个移除 content blocks`

**现状：** `hardTruncate`（`conversationService.go:1249`）从 `blocks[0]` 开始移除，但 `blocks` 的顺序来自 `resolveParentContext` 中遍历 `parentMap`（Go `map`），Go map 的迭代顺序是**随机的**，不保证按关联时间排序。

**影响：** 裁剪优先级不可预测，可能裁掉更重要的（最新关联的）parent context 而保留不太重要的。

**修复方案：** 在 `resolveParentContext` 中，给 blocks 按 node 创建时间排序，或者在构建 `parentMap` 后排序再遍历。

---

### Bug 4（健壮性）: `getChatNodeSummary` 加锁后未 double-check 缓存 //fixed

**现状：** `conversationService.go:982` 加锁成功后直接调用 `generateNodeSummary`，未再次检查缓存。

**问题场景：** 第一个请求生成完毕并写入缓存、释放锁后，第二个请求此时 `SetNX` 成功（因为锁已释放），会**重复生成**一次 node summary。

**影响：** 浪费一次 AI 调用，不影响正确性。

**修复方案：** 加锁成功后再查一次缓存：
```go
if acquired {
    // double-check: 另一个请求可能已经生成完毕
    cached, err := s.conversationRepo.GetNodeSummaryCache(ctx, nodeID, conv.CurrentLeafID)
    if err == nil && cached != "" {
        _ = s.conversationRepo.ReleaseNodeSummaryLock(ctx, nodeID, conv.CurrentLeafID)
        return cached, nil
    }
    summary, err := s.generateNodeSummary(...)
    ...
}
```

---

### Bug 5（隐含假设）: `countChatMsgRounds` 假设严格 user/assistant 交替 //fixed

**现状：** `conversationService.go:939` 以步长 2 遍历消息列表，检查 `msgs[i].Role == "user" && msgs[i+1].Role == "assistant"`。

**问题：** 如果出现非标准消息序列（如连续两条 user 消息，或 assistant 后直接跟 assistant），步长 2 迭代会错位，导致后续所有 pair 都无法匹配，轮数被严重低估。

**影响：** 正常使用中概率极低（parent chain 保证交替），但在 aborted/error 消息场景下可能出现意外序列。轮数低估会导致 summary 触发条件误判。

**修复方案：** 当前可暂不修复，添加注释说明前提假设（严格交替）。如果未来引入消息编辑/删除功能需重新审视。
