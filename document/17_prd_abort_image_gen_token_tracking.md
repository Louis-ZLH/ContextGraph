# 17 图片生成中断：Token 消耗追踪

> **前置条件：15.2 AI 文件/图片生成核心功能已完成。**

---

## 一、背景与动机

当用户在图片生成过程中点击"停止"（abort），前端 SSE 连接断开，Go 后端通过 `writeErrAssistant` 写入一条 `status = "aborted"` 的 assistant message。然而 OpenAI 侧的图片生成请求**无法被取消**，会继续运行至完成并正常扣费。

当前问题：

1. **abort 消息的 `prompt_tokens` / `completion_tokens` 为 0** — 无法追踪被中断请求的实际 API 消耗
2. **Token 用量信息丢失** — 正常完成时，AI service 通过 `complete` SSE 事件将 token 用量传给 Go 后端；但 abort 场景下 SSE 连接已断开，Go 的 `SendMessage` 已 return，`ImageGenUsage` 无通道回传
3. **成本不透明** — 恶意或频繁 abort 造成的 API 浪费无法被发现和统计

### 目标

- 图片生成被 abort 后，AI service 等待 OpenAI 返回最终 usage，然后通过内部 API 将 token 消耗写回对应的 abort message
- 不改变现有的正常完成流程（`complete` 事件仍然是主通道）

---

## 二、现有流程分析

### 2.1 正常完成时的 token 流

```
OpenAI API 返回 usage
  → tool_executor.py yield ImageGenUsage(input_tokens, output_tokens)
  → llm.py 累加到 total_prompt_tokens / total_completion_tokens
  → llm.py yield TokenUsage(prompt_tokens, completion_tokens)
  → chat.py 放入 complete_event: {"type": "complete", "prompt_tokens": N, "completion_tokens": M}
  → Go conversationService 从 evt.PromptTokens / evt.CompletionTokens 写入 DB
```

### 2.2 abort 时的断裂点

```
用户点停止
  → 前端 abort() → SSE 连接断开
  → Go ctx cancelled → aiCancel() → SendMessage 写入 aborted msg (prompt_tokens=0) → return
  → AI service 检测 cancelled=True → 但 OpenAI 请求仍在跑
  → OpenAI 最终返回 usage → ❌ 无通道回传给 Go
```

### 2.3 修复后的流程

```
用户点停止
  → Go 写入 aborted msg (prompt_tokens=0) → return           ... (先)
  → OpenAI 最终返回 usage                                     ... (后)
  → AI service PATCH /api/internal/messages/{id}/usage
  → Go 内部接口 UPDATE messages SET prompt_tokens=?, completion_tokens=? WHERE id=?
```

---

## 三、核心设计

### 3.1 AI service：abort 后回写 token 用量

在 `create_image_stream` 中，当检测到 `context.cancelled` 时，OpenAI 的 stream 可能已经部分完成。需要区分两种 cancel 场景：

**场景 A：OpenAI stream 尚未完成（在 `async for event in stream` 循环中检测到 cancel）**

此时 `image_usage` 可能为 None（尚未收到 `image_generation.completed` 事件）。OpenAI 已在处理中，**仍会扣费**，但我们拿不到 usage。

> 这种情况下 OpenAI 的 stream iterator 会在连接断开后抛出异常或自然结束，此时如果 `image_usage` 已被赋值则可回写。

**场景 B：OpenAI stream 已完成，cancel 发生在 MinIO 写入前（checkpoint 2）**

此时 `image_usage` 已有值，可以直接回写。

**实现方式：** 在 `create_image_stream` 的 cancel 返回路径上，如果 `image_usage` 存在，则 yield 一个 `ImageGenUsage` 事件。但由于 cancel 场景下 SSE 连接已断，这个 yield 无法传到 Go。

因此需要**直接从 AI service 调用 Go 内部 API** 回写 usage。

### 3.2 新增内部接口：更新消息 token 用量

```
PATCH /api/internal/messages/{message_id}/usage

Request:
{
    "prompt_tokens": 3200,
    "completion_tokens": 4800
}

Response:
{ "code": 0, "message": "ok" }
```

Go 后端实现：直接 `UPDATE messages SET prompt_tokens = ?, completion_tokens = ? WHERE id = ?`。

**不需要轮询/等待**：abort 场景下，Go 的 `writeErrAssistant` 在 `SendMessage` return 前同步执行，而 AI service 的回写请求要等 OpenAI 返回 usage（通常需要数秒），时序上 `writeErrAssistant` 一定先完成。

### 3.3 异常兜底

| 场景 | 处理 |
|------|------|
| Go abort 消息尚未写入（极端 race condition） | AI service 发起请求，Go 返回 404 → AI service 等 1s 重试一次 |
| OpenAI 请求被 CancelledError 中断，拿不到 usage | 不回写（prompt_tokens 保持 0），记录日志 |
| AI service 回写请求网络失败 | 重试一次，仍失败则记录日志放弃（非关键路径） |

---

## 四、逐文件变更清单

### Phase 1：Go 后端 — 新增内部接口

#### 4.1 DTO（`internal/dto/chat.go`）

- [x] 新增 `UpdateMessageUsageRequest` struct

```go
type UpdateMessageUsageRequest struct {
    PromptTokens     int `json:"prompt_tokens"`
    CompletionTokens int `json:"completion_tokens"`
}
```

#### 4.2 Repository（`internal/repo/conversationRepo.go`）

- [x] 新增 `UpdateMessageTokenUsage(ctx, messageID int64, promptTokens, completionTokens int) error`
- [x] 实现：`UPDATE messages SET prompt_tokens = ?, completion_tokens = ? WHERE id = ?`
- [x] 如果 `RowsAffected == 0` 返回自定义 404 错误（供 handler 层判断）

#### 4.2.1 Service（`internal/service/conversationService.go`）

- [x] 新增 `UpdateMessageTokenUsage(ctx, messageID int64, promptTokens, completionTokens int) error`
- [x] 直接透传调用 `conversationRepo.UpdateMessageTokenUsage`

#### 4.3 Handler（`internal/handler/internalHandler.go`）

- [x] `InternalHandler` struct 新增依赖，定义 interface（与现有 `InternalFileService` 模式一致）：

```go
type InternalConversationService interface {
    UpdateMessageTokenUsage(ctx context.Context, messageID int64, promptTokens, completionTokens int) error
}
```

- [x] `InternalHandler` struct 添加 `conversationService InternalConversationService` 字段
- [x] `NewInternalHandler` 构造函数增加 `conversationService` 参数
- [x] 新增 `UpdateMessageUsage` handler 方法
- [x] 从 URL path 解析 `message_id`（`strconv.ParseInt(c.Param("message_id"), 10, 64)`）
- [x] 调用 `conversationService.UpdateMessageTokenUsage` 更新 token 用量
- [x] 如果 message 不存在返回 404

#### 4.3.1 依赖注入（`internal/app/app.go`）

- [x] `wireHandlers` 中将 `conversationService` 传入 `NewInternalHandler`：

```go
internalHandler := handler.NewInternalHandler(fileService, conversationService)
```

#### 4.4 Router（`internal/api/internal.go`）

- [x] 新增路由：`internal.PATCH("/messages/:message_id/usage", a.H.InternalHandler.UpdateMessageUsage)`

### Phase 2：Python AI service — abort 时回写 usage

#### 4.5 新增 Go 内部 API 调用函数

- [ ] 在 `services/tool_executor.py` 中新增（与现有的 `_register_file_with_go_backend`、`_get_internal_client` 保持同模块，避免新增文件）：

```python
async def report_abort_usage(message_id: str, prompt_tokens: int, completion_tokens: int) -> bool:
    """Report token usage for an aborted image generation to Go backend."""
```

- [ ] 实现：`PATCH {GO_BACKEND_URL}/api/internal/messages/{message_id}/usage`
- [ ] 失败时等 1s 重试一次，仍失败则 log warning 返回 False

#### 4.6 修改 `create_image_stream`（`services/tool_executor.py`）

- [ ] 在 cancel checkpoint 1（第 306-309 行）和 cancel checkpoint 2（第 328-331 行）的 return 前，如果 `image_usage` 存在，调用 `report_abort_usage`

```python
# Cancel checkpoint 1: between partial events
if context.cancelled:
    logger.info("create_image cancelled by client disconnect")
    if image_usage:
        await report_abort_usage(context.message_id, image_usage.input_tokens, image_usage.output_tokens)
    yield "Error: Image generation was cancelled."
    return
```

> **注意：** Checkpoint 1 位于 `async for event in stream` 循环内部，此时 `image_generation.completed` 事件通常尚未到达，因此 `image_usage` 大概率为 None。该处的 `if image_usage:` 检查属于防御性编程，实际回写主要由 checkpoint 2 和 `CancelledError` handler 触发。

- [ ] 在 `except asyncio.CancelledError` 分支（第 392-397 行）中，如果 `image_usage` 已被赋值，使用 **`asyncio.create_task()`** 发起回写（而非 `await`）

> **注意：** 在 `CancelledError` handler 中 `await` 一个新协程会被立即取消，导致 HTTP 请求无法完成。必须使用 fire-and-forget 模式，与现有 MinIO 清理逻辑（`asyncio.create_task(_cleanup_minio_file_with_retry(...))`）保持一致。

```python
except asyncio.CancelledError:
    if minio_path:
        asyncio.create_task(_cleanup_minio_file_with_retry(minio_path))
    if image_usage:
        asyncio.create_task(report_abort_usage(
            context.message_id, image_usage.input_tokens, image_usage.output_tokens
        ))
    raise
```

#### 4.7 LLM 层 cancel 处理（`services/llm.py`）

- [ ] **无需改动**。回写逻辑完全封装在 `create_image_stream` 内部（通过 checkpoint 1/2 的 `await report_abort_usage` 和 `CancelledError` handler 的 `asyncio.create_task`），不需要 `llm.py` 层感知 abort 回写，减少跨层耦合

### 覆盖范围说明：SendMessage 与 RetryMessage

Go 后端的 `SendMessage` 和 `RetryMessage` 都各自定义了 `writeErrAssistant` 闭包，abort 时都会写入 `prompt_tokens=0` 的 assistant message。本方案对两条路径均有效：AI service 侧的回写通过 `context.message_id` 定位 message，不区分请求来源是 Send 还是 Retry，无需额外代码改动。

### Phase 3：前端（无改动）

前端无需改动。abort 时 message 的 `prompt_tokens` / `completion_tokens` 初始为 0，后续被 Go 内部接口更新后，仅影响数据库记录，不影响 UI 展示。

### Phase 4：测试

- [x] 测试：正常完成的图片生成，token 用量写入不变（回归）
- [ ] 测试：abort 时 OpenAI 已返回 usage（checkpoint 2），AI service 成功回写 token 到 Go
- [ ] 测试：abort 时 OpenAI 尚未返回 usage（checkpoint 1），prompt_tokens 保持 0，无报错
- [x] 测试：Go 内部接口 404（message 尚未写入），AI service 重试后成功
- [x] 测试：Go 内部接口网络不可达，AI service 记录 warning 不崩溃
- [x] 测试：正常文本对话 abort 不受影响（无 create_image 调用）

---

## 五、关键设计决策索引

| 决策项 | 选择 | 说明 |
|--------|------|------|
| 回写方式 | AI service 主动 PATCH Go 内部 API | SSE 已断，无法通过事件流传递 |
| 是否轮询 | 否，直接 UPDATE + 1 次重试兜底 | `writeErrAssistant` 时序上一定先于 OpenAI 返回 usage |
| usage 不可用时 | 不回写，保持 prompt_tokens=0 | CancelledError 中断 OpenAI stream 时可能拿不到 usage |
| 影响范围 | 仅 `create_image`，不涉及 `create_file` | 文本文件生成是同步的，不存在 abort 后 API 仍在消耗的问题 |
| 前端改动 | 无 | token 用量仅用于后台统计，不影响 UI |

---

## 六、已知限制：image token 混算问题

> **本 PRD 不处理此问题，将在后续独立 PRD 中统一解决。**

当前 image token（来自 gpt-image-1）在 `llm.py` 中被累加到 `total_prompt_tokens` / `total_completion_tokens`，与 LLM 自身的 token 混合存储在同一条 message 记录中。而 message 的 `Model` 字段记录的是 LLM 模型（如 DeepSeek），导致后续按模型单价计算费用时，image token 会被错误地按 LLM 价格计算。

**后续计划：** 启用已定义但未使用的 `token_usage_logs` 表（`internal/model/tokenUsageLog.go`），按模型分条记录 token 消耗及 `snapshot_cost`，实现精确的分模型计费。该表已包含 `ModelName` 和 `SnapshotCost` 字段，适合承载此需求。目前产品处于内测阶段，暂不收费，优先级较低。
