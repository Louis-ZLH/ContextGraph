# 严格 User/Assistant 交替保障方案

## 问题背景

Claude API (Anthropic Messages API) **严格要求** user/assistant 消息交替排列，违反则返回 400 错误。
当前代码在 user message 写入 DB 后，存在多个失败路径不会写入 assistant message，
导致 DB 中出现"孤儿 user message"，后续对话构建 prompt 时出现连续 user，触发 Claude API 报错。

---

## 根因分析

### 完整失败路径清单

以 `SendMessage` 为例，`CreateMessage(ctx, &userMsg)` 成功（line 171）且 `UpdateCurrentLeafID` 成功（line 182）后，
`currentLeafID` 已指向 `userMsg.ID`。此后 **所有 return 路径** 如果不写入 assistant，都会产生孤儿：

| # | 代码位置 | 失败原因 | 当前是否写 assistant | 后果 |
|---|----------|----------|---------------------|------|
| 1 | line 192 | `injectParentContext` 失败 | **否** | 孤儿 user |
| 2 | line 200 | `hardTruncate` 失败 | **否** | 孤儿 user |
| 3 | line 214 | `StreamChat` 连接失败 | **否** | 孤儿 user |
| 4 | line 258 | 保存 completed assistant 到 DB 失败 | **否**（写入本身失败） | 孤儿 user |
| 5 | line 272 | AI error + `fullContent.Len() == 0` | **否** | 孤儿 user |
| 6 | line 290 | 首 token 超时 30s | **否** | 孤儿 user |
| 7 | line 295 | 客户端 abort + `fullContent.Len() == 0` | **否** | 孤儿 user |

### 影响链

```
DB 状态：root → u1 → a1 → u2(孤儿，无 assistant)     leaf = u2
                                ↓
用户发送 u3（parentID = u2.ID = currentLeafID）
                                ↓
buildMessageChain 回溯 = [u1, a1, u2, u3]    ← 连续两个 user
                                ↓
发送到 Claude API → 400 Bad Request
```

---

## 修复方案

### 原则

1. **写入端（Write-side）**：user message 写入 DB 后，**任何** 失败路径都必须写入一条 `status=error/aborted` 的 assistant message，保证 DB 中 user/assistant 成对存在
2. **读取端（Read-side）**：`buildMessageChain` 构建 AI prompt 时，**跳过** 空内容的 error/aborted assistant 及其配对的 user message
3. **展示端（Display-side）**：前端 `GetMessages` 照常返回所有消息，用户可以看到失败状态并 retry

---

## 后端改动清单

### 1. `ErrorData` 增加 `message_id` 字段

**文件**：`internal/dto/chat.go:112-114`

```go
// 当前
type ErrorData struct {
    Message string `json:"message"`
}

// 改为
type ErrorData struct {
    Message   string `json:"message"`
    MessageID string `json:"message_id,omitempty"`
}
```

**理由**：后端写入 error assistant 后，需要将其 ID 通过 SSE error 事件告知前端，
前端用该 ID 替换 placeholder，实现乐观更新 → 真实 ID 的衔接。

---

### 2. `SendMessage` — 使用 `defer` + flag 兜底所有失败路径

**文件**：`internal/service/conversationService.go`

**核心思路**：在 user message 写入成功后，立即注册 `defer`。
函数无论从哪个 return 退出，只要 assistant 没被正常写入，defer 就会补写一条 error assistant。

#### 2a. 提前生成 `assistantMsgID`，通过 `user_message` 事件传给前端，注册 defer 兜底

将 `assistantMsgID := idgen.GenID()` 从当前 line 207 **提前**到 `CreateMessage` 之后、`user_message SSE` 之前。
在 `user_message` SSE 事件中携带 `assistantMsgID`，让前端在 abort 场景下也能 confirm assistant placeholder（解决 abort2 前后端 currentLeafID 不一致问题）。
同时声明 `assistantWritten` flag 和 `writeErrAssistant` 闭包：

> **当前代码顺序**：CreateMessage(171) → user_message SSE(177) → UpdateCurrentLeafID(182)
> **新顺序**：CreateMessage → **assistantMsgID 生成 + defer 注册** → user_message SSE（含 assistantMsgID）→ UpdateCurrentLeafID
> 这样 abort2 场景下前端已通过 `user_message` 事件获得 `assistantMsgID`，可直接 confirm + abort，无需 remove placeholder。
> UpdateCurrentLeafID 失败也能被 defer 兜底。

**新增 DTO**（`internal/dto/chat.go`）：
```go
type UserMessageEvent struct {
    FullMessage
    AssistantMsgID int64 `json:"assistant_msg_id,string"`
}
```

**修改 `user_message` SSE 事件**：
```go
eventCh <- dto.SSEEvent{
    Type: "user_message",
    Data: dto.UserMessageEvent{
        FullMessage:    modelToFullMessage(userMsg),
        AssistantMsgID: assistantMsgID,
    },
}
```

```go
// ---- 插入位置：CreateMessage 之后、user_message SSE 之前 ----

// 预生成 assistant message ID（提前，用于 defer 兜底 + 通过 user_message 传给前端）
assistantMsgID := idgen.GenID()
var assistantWritten bool
var deferErrMsg string // 早期失败分支设置错误信息，由 defer 统一发送

// 兜底闭包：写入 error assistant + 更新 leaf
writeErrAssistant := func(content string, status string) string {
    if assistantWritten {
        return ""
    }
    errMsg := model.Message{
        ConversationID: req.ConversationID,
        ParentID:       &userMsg.ID,
        Role:           "assistant",
        Content:        content,
        Model:          &req.Model,
        Status:         status,
    }
    errMsg.ID = assistantMsgID
    _ = s.conversationRepo.CreateMessage(context.Background(), &errMsg)
    _ = s.conversationRepo.UpdateCurrentLeafID(context.Background(), req.ConversationID, errMsg.ID)
    assistantWritten = true
    return strconv.FormatInt(assistantMsgID, 10)
}

// 安全网：函数退出时，如果 assistant 未被写入，自动补写 + 统一发送 SSE error
defer func() {
    msgIDStr := writeErrAssistant("", "error")
    if msgIDStr == "" {
        return // assistantWritten 已为 true，无需发送
    }
    if deferErrMsg == "" {
        deferErrMsg = "Internal error"
    }
    eventCh <- dto.SSEEvent{
        Type: "error",
        Data: dto.ErrorData{
            Message:   deferErrMsg,
            MessageID: msgIDStr,
        },
    }
}()
```

> **defer 执行顺序**：Go defer 按 LIFO 执行。`defer close(eventCh)`（line 149）最先注册，
> 本 defer 后注册，因此本 defer **先于** `close(eventCh)` 执行，向 eventCh 发送 SSE error 是安全的。

#### 2b. 已有的显式失败分支 — 调用 `writeErrAssistant` 并在 SSE 传回 messageID

对于 AI 相关的三个失败分支（error / timeout / abort），仍然显式调用 `writeErrAssistant`，
这样可以在 SSE error 事件中携带 `message_id`：

**AI 返回 error（当前 line 269-286）：**
```go
case "error":
    firstTokenTimer.Stop()
    msgIDStr := writeErrAssistant(fullContent.String(), "error")
    eventCh <- dto.SSEEvent{
        Type: "error",
        Data: dto.ErrorData{
            Message:   evt.Content,
            MessageID: msgIDStr,
        },
    }
    return
```

**首 token 超时（当前 line 289-293）：**
```go
if timedOut.Load() && !firstTokenReceived {
    msgIDStr := writeErrAssistant("", "error")
    eventCh <- dto.SSEEvent{
        Type: "error",
        Data: dto.ErrorData{
            Message:   "AI 服务响应超时，请稍后重试",
            MessageID: msgIDStr,
        },
    }
    return
}
```

**客户端 abort（当前 line 294-307）：**
```go
// 客户端 abort 或连接断开（SSE 已断，无需传 messageID）
writeErrAssistant(fullContent.String(), "aborted")
```

#### 2c. 成功路径 — 标记 `assistantWritten = true`

在 `case "complete"` 分支中，assistant 成功写入 DB 后标记 flag：

```go
case "complete":
    firstTokenTimer.Stop()
    assistantMsg := model.Message{...}
    assistantMsg.ID = assistantMsgID
    if err := s.conversationRepo.CreateMessage(ctx, &assistantMsg); err != nil {
        // 写入失败，defer 会兜底写一条 error assistant 并发送 SSE error
        deferErrMsg = "Failed to save assistant message"
        return
    }
    assistantWritten = true  // ← 标记成功，阻止 defer 重复写入
    _ = s.conversationRepo.UpdateCurrentLeafID(ctx, req.ConversationID, assistantMsg.ID)
    // ... 发送 complete 事件
```

#### 2d. 早期失败路径 — 删除 SSE error，由 defer 统一处理

`UpdateCurrentLeafID` 失败（line 182）、`injectParentContext` 失败（line 192）、`hardTruncate` 失败（line 200）、`StreamChat` 连接失败（line 214）
这些分支**删除原有的 `eventCh <- SSEEvent{error}`**，仅设置 `deferErrMsg` 后 `return`。
defer 统一负责：写入 error assistant → 发送带 `message_id` 的 SSE error。

```go
// UpdateCurrentLeafID 失败（当前 line 182-185）
if err := s.conversationRepo.UpdateCurrentLeafID(ctx, req.ConversationID, userMsg.ID); err != nil {
    deferErrMsg = "Failed to update conversation"
    return // defer 兜底：writeErrAssistant + SSE error（带 message_id）
}

// injectParentContext 失败（当前 line 191-195）
chatMessages, err = s.injectParentContext(ctx, req.ConversationID, req.ParentDelta, chatMessages)
if err != nil {
    deferErrMsg = err.Error()
    return
}

// hardTruncate 失败（当前 line 200-204）
chatMessages, err = s.hardTruncate(chatMessages, len(rawMessages))
if err != nil {
    deferErrMsg = err.Error()
    return
}

// StreamChat 连接失败（当前 line 213-217）
aiCh, err := s.ai.StreamChat(aiCtx, chatMessages, req.Model)
if err != nil {
    deferErrMsg = "Failed to call AI service"
    return
}
```

> **关键优势**：defer 先写 DB（拿到 `message_id`），再发 SSE error（携带 `message_id`）。
> 前端 error2 路径始终能拿到非 null 的 `messageId`，可正确 confirm placeholder 并标记 error。
>
> **`UpdateCurrentLeafID` 特别说明**：`writeErrAssistant` 内部的 `UpdateCurrentLeafID`（指向 error assistant）
> 可间接修复 leaf 指针，使 leaf 从旧位置直接跳到 error assistant → user → 旧链。

---

### 3. `RetryMessage` — 同样使用 defer 兜底

**文件**：`internal/service/conversationService.go`

`RetryMessage` 不创建新 user message，但 AI 失败分支同样需要写入 error assistant。
改法与 `SendMessage` 对称：

- 将 `assistantMsgID` 提前到 **user message 验证通过之后**（当前 line 341 之后，即确认 `userMsg` 存在且属于该 conversation 后）
- 注册 `defer + writeErrAssistant + deferErrMsg` 兜底（含 SSE error 统一发送）
- `ParentID` 使用 `&req.UserMsgID`
- AI error / timeout / abort 三个分支显式调用 `writeErrAssistant`
- 早期失败分支（`injectParentContext` / `hardTruncate` / `StreamChat`）同 SendMessage：删除 SSE error，仅设置 `deferErrMsg` + `return`
- `case "complete"` 写入失败同理：仅设置 `deferErrMsg` + `return`
- **发送 `retry_ack` 事件**：defer 注册后、`buildMessageChain` 之前，发送 `retry_ack` SSE 事件携带 `assistantMsgID`，让前端在 abort 场景下可直接 confirm（与 SendMessage 的 `user_message` 事件对称）

**新增 DTO**（`internal/dto/chat.go`）：
```go
type RetryAckEvent struct {
    AssistantMsgID int64 `json:"assistant_msg_id,string"`
}
```

**发送事件**（插入位置：user message 验证通过 + defer 注册之后、`buildMessageChain` 之前）：
```go
eventCh <- dto.SSEEvent{
    Type: "retry_ack",
    Data: dto.RetryAckEvent{AssistantMsgID: assistantMsgID},
}
```

> **插入点说明**：不能在权限校验或 user message 验证之前注册 defer，
> 否则 `GetMessageByID` 失败或权限校验失败时 defer 也会对不存在的 user message 写入 error assistant。
> 必须在确认 user message 有效后才注册。
>
> **行为变更说明**：当前 RetryMessage 早期失败时不更新 leaf。加入 defer 后，
> 会创建 error assistant 并更新 leaf 指向它。用户会看到 error 状态，可通过 sibling 导航或再次 retry。
> 这是有意为之的行为变更——保证 DB 中 user/assistant 始终成对。

---

### 4. `buildMessageChain` — 读取端跳过空 error/aborted 对

**文件**：`internal/service/conversationService.go` (当前 line 825-902)

在步骤 3（构建 rawMessages）之后、步骤 5（注入 summary）之前，对 `collected` 进行过滤：

```go
// 3.5 过滤/修饰 error/aborted assistant（仅影响 chatMessages，不影响 rawMessages）
var filtered []rawMsg
for i := 0; i < len(collected); i++ {
    msg := collected[i]
    if msg.msg.Role == "assistant" &&
       (msg.msg.Status == "error" || msg.msg.Status == "aborted") {

        if msg.msg.Content == "" {
            // 空内容 → 跳过 assistant，同时移除前面配对的 user
            if len(filtered) > 0 && filtered[len(filtered)-1].msg.Role == "user" {
                filtered = filtered[:len(filtered)-1]
            }
            continue
        }

        // 有内容但未完成 → 追加中断说明，让 AI 知道上次回复被截断
        // msg 已经是 collected[i] 的值拷贝，修改不影响原始数据
        // 注意：必须同步更新 msg.chatMsg.Content，因为 chatMessages 是从 chatMsg 构建的
        var suffix string
        if msg.msg.Status == "aborted" {
            suffix = "\n\n[System: Generation interrupted by user]"
        } else { // "error"
            suffix = "\n\n[System: Generation interrupted by error]"
        }
        msg.msg.Content += suffix
        msg.chatMsg.Content = msg.msg.Content // 同步到 chatMsg（Content 为 interface{}）
        filtered = append(filtered, msg)
        continue
    }
    filtered = append(filtered, msg)
}
```

然后用 `filtered` 替代 `collected` 来构建 `chatMessages`（summary 注入等），
**`rawMessages` 仍然从原始 `collected` 构建**，保证步数与 DB parent chain 一致（`asyncGenerateMsgSummary` 依赖步数回溯定位目标）。

**处理逻辑总结**：
- 空内容的 error/aborted assistant → **跳过**（连同配对的 user 一起移除）
- 有内容的 error/aborted assistant → **保留**，但追加 `[System: Generation interrupted by user/error]` 说明，让 AI 理解上次回复不完整

---

### 4.0.1 `countChatMsgRounds` — 跳过空 content assistant 轮次

**文件**：`internal/service/conversationService.go` (当前 line 946-955)

当前实现只看 `Role` 匹配，空 content 的 error/aborted assistant 也会被计入一轮。
这导致 `fullRoundCount` 虚高，可能提前触发 summary 生成、或影响 summary 可用性判断（`rounds >= 3`）。

```go
// ---------- 当前 ----------
func countChatMsgRounds(msgs []infra.ChatMessage) int {
    rounds := 0
    for i := 0; i+1 < len(msgs); i += 2 {
        if msgs[i].Role == "user" && msgs[i+1].Role == "assistant" {
            rounds++
        }
    }
    return rounds
}

// ---------- 改为 ----------
func countChatMsgRounds(msgs []infra.ChatMessage) int {
    rounds := 0
    for i := 0; i+1 < len(msgs); i += 2 {
        if msgs[i].Role == "user" && msgs[i+1].Role == "assistant" {
            // 跳过空 content assistant（error/aborted 场景），不计入有效轮次
            if content, ok := msgs[i+1].Content.(string); ok && content == "" {
                continue
            }
            rounds++
        }
    }
    return rounds
}
```

**影响范围**：`countChatMsgRounds` 被两处调用——
1. `buildMessageChain` 步骤 4 计算 `fullRoundCount`（传给 `maybeTriggerSummary` 做阈值判断）
2. `buildMessageChain` 步骤 2 判断 summary 是否可用（`rounds >= 3`）

两处都应排除空轮次，避免虚高计数。

---

### 4.0.2 `buildFallbackChain` — 跳过空 content assistant 轮次

**文件**：`internal/service/conversationService.go` (当前 line 928-945)

`buildFallbackChain` 在 summary lock 等待超时时作为 fallback 路径。
当前直接用 `keepRecentRounds` 保留最近 3 轮，不做空 content assistant 过滤。
如果 parent 链上存在空 error/aborted assistant，这些轮次会通过 fallback 进入 `chatMessages`，
导致空 assistant 或连续 user 被发送到 Claude API。

**修改**：在 `keepRecentRounds` 之前过滤掉空 content assistant 及其配对 user：

```go
func (s *ConversationService) buildFallbackChain(ctx context.Context, leafID int64) ([]infra.ChatMessage, []infra.ChatMessage, int) {
    var chain []infra.ChatMessage
    msgID := &leafID
    for msgID != nil {
        msg, err := s.conversationRepo.GetMessageByID(ctx, *msgID)
        if err != nil {
            break
        }
        if msg.Role == "root" {
            break
        }
        chain = append([]infra.ChatMessage{{Role: msg.Role, Content: msg.Content}}, chain...)
        msgID = msg.ParentID
    }

    // 过滤空 content assistant 及其配对 user（与 buildMessageChain 步骤 3.5 对齐）
    var filtered []infra.ChatMessage
    for i := 0; i+1 < len(chain); i += 2 {
        if content, ok := chain[i+1].Content.(string); ok && content == "" {
            continue // 跳过空 assistant 及其配对 user
        }
        filtered = append(filtered, chain[i], chain[i+1])
    }
    if len(chain)%2 == 1 {
        filtered = append(filtered, chain[len(chain)-1])
    }

    kept := keepRecentRounds(filtered, 3)
    return kept, kept, countChatMsgRounds(kept)
}
```

**注意**：fallback 路径不需要保留未过滤的 `rawMessages`（不涉及 summary 挂载和步数回溯），
因此直接在 `chain` 上过滤后再调用 `keepRecentRounds`。

---

### 4.1 `maybeTriggerSummary` — targetIdx 不能落在空 error/aborted assistant

**文件**：`internal/service/conversationService.go` (当前 line 1131-1173)

`targetIdx` 指向的 `rawMessages[targetIdx-1]` 是 summary 挂载目标 assistant。
如果该 assistant 是空 error/aborted，它在 `buildMessageChain` 步骤 3.5 中会被跳过，
导致 summary 写上去了但永远读不到。

**修改**：计算 `targetIdx` 后，检查目标是否为空内容 assistant，如果是则向前退：

```go
targetIdx := len(rawMessages) - (summaryOffsetRounds*2 + 1)

// 确保 target 不落在空 error/aborted assistant 上
// （空内容 assistant 在 chatMessages 过滤时会被跳过，summary 挂载其上等于丢失）
for targetIdx >= 2 {
    if content, ok := rawMessages[targetIdx-1].Content.(string); ok && content == "" {
        targetIdx -= 2 // 跳过这一空轮，继续向前
        continue
    }
    break
}
if targetIdx < 2 {
    _ = s.conversationRepo.ReleaseMsgSummaryLock(context.Background(), conversationID)
    return
}
```

**原理**：completed assistant 一定有内容，空 Content 只出现在 error/aborted 场景。
用 `Content == ""` 作为代理判断，无需在 `infra.ChatMessage` 中增加 Status 字段。

---

### 4.2 `asyncGenerateMsgSummary` — summaryInput 跳过空 error/aborted 对

**文件**：`internal/service/conversationService.go` (当前 line 1175-1235)

`summaryInput = rawMessages[:targetIdx]` 包含到目标 assistant 为止的所有消息。
其中可能存在空 error/aborted assistant 和配对 user，对 summary 没有价值，应过滤掉。

**修改**：在构建 `summaryInput` 后过滤：

```go
summaryInput := rawMessages[:targetIdx]

// 过滤空 error/aborted 对：空 assistant + 配对 user 不参与 summary 生成
var cleanInput []infra.ChatMessage
for i := 0; i+1 < len(summaryInput); i += 2 {
    if content, ok := summaryInput[i+1].Content.(string); ok && content == "" {
        continue // 跳过空 assistant 及其配对 user
    }
    cleanInput = append(cleanInput, summaryInput[i], summaryInput[i+1])
}
// 防御性处理奇数末尾（正常不会出现）
if len(summaryInput)%2 == 1 {
    cleanInput = append(cleanInput, summaryInput[len(summaryInput)-1])
}
summaryInput = cleanInput
```

**注意**：`rawMessages` 本身不过滤、不修改长度，因为 `asyncGenerateMsgSummary` 中的
步数回溯（`stepsToTarget = len(rawMessages) - targetIdx`）依赖它和 DB parent chain 的步数对齐。
过滤只在 summary 输入层面做。

---

## 前端改动清单

### 5. SSE 事件处理 — `user_message` 提取 `assistantMsgId` + `error` 提取 `message_id`

**文件**：`front-end/src/service/chat.ts`

#### 5a. `user_message` 事件提取 `assistantMsgId`（当前 line 113-118）

```typescript
// ---------- 当前 ----------
case "user_message":
    if (event.data) {
        callbacks.onUserMessage(toCamelCase(event.data) as Message);
        userMsgId = event.data.id as string;
    }
    break;

// ---------- 改为 ----------
case "user_message":
    if (event.data) {
        const assistantMsgId = event.data.assistant_msg_id as string;
        callbacks.onUserMessage(toCamelCase(event.data) as Message, assistantMsgId);
        userMsgId = event.data.id as string;
    }
    break;
```

**效果**：前端在收到 `user_message` 时即获得后端预生成的 `assistantMsgID`，
abort2 场景下可直接用此 ID confirm assistant placeholder，无需 remove + reload。

#### 5b. `error` 事件提取 `message_id`（当前 line 130-133）

```typescript
// ---------- 当前 ----------
case "error":
    callbacks.onError(messageId, userMsgId, new Error(event.data.message as string));
    messageId = null;
    break;

// ---------- 改为 ----------
case "error":
    // user 落库后，后端始终写入 error assistant 并通过 message_id 传回
    if (event.data.message_id) messageId = event.data.message_id as string;
    callbacks.onError(messageId, userMsgId, new Error(event.data.message as string));
    messageId = null;
    break;
```

**效果**：user 落库后的 error，`messageId` 不再为 null，前端可区分三种情况。

> **说明**：user 落库后的所有失败路径（包括早期失败），SSE error 事件**始终**携带 `message_id`，
> 因为 defer 统一负责先写 DB 再发 SSE error。
> 仅 user 落库之前的失败（权限校验、CreateMessage 失败等）不含 `message_id`，此时 `messageId` 为 null。

#### 5c. `retry_ack` 事件提取 `assistantMsgId`

```typescript
case "retry_ack":
    if (event.data) {
        callbacks.onRetryAck?.(event.data.assistant_msg_id as string);
    }
    break;
```

**效果**：retry 流程中前端在 AI 调用之前即获得 `assistantMsgID`，
abort 场景下可直接 confirm assistant placeholder，与 send 流程的 abort2 对齐。

---

### 5.5 `useChatStream.ts` onUserMessage / onRetryAck — 存储 `assistantMsgId`

**文件**：`front-end/src/feature/chat/useChatStream.ts` (当前 line 77-80)

```typescript
// ---------- 当前 ----------
onUserMessage: (message: Message) => {
    if(!tempMsgId) return;
    confirmUserMsgRef.current = { tempMsgId, msgId: message.id };
},

// ---------- 改为 ----------
onUserMessage: (message: Message, assistantMsgId: string) => {
    if(!tempMsgId) return;
    confirmUserMsgRef.current = { tempMsgId, msgId: message.id, assistantMsgId };
},
```

**效果**：`confirmUserMsgRef` 同时存储 `assistantMsgId`，供 abort2 路径使用。

**新增 `onRetryAck` 回调**（retry 对称处理）：

```typescript
onRetryAck: (assistantMsgId: string) => {
    confirmUserMsgRef.current = { tempMsgId: null, msgId: null, assistantMsgId };
},
```

**效果**：retry 流程中 `confirmUserMsgRef` 也会被设置（`tempMsgId`/`msgId` 为 null 表示 retry），
abort/error 处理统一通过 `confirmUserMsgRef` 判断是否已过验证阶段，通过 `tempMsgId` 是否为 null 区分 send/retry。

---

### 6. `useChatStream.ts` onError — 多阶段错误处理

**文件**：`front-end/src/feature/chat/useChatStream.ts` (当前 line 109-127)

错误发生时机可分为三个互斥阶段，用两个 ref + `messageId` 判断：

| 阶段 | `confirmUserMsgRef` | `streamCtxRef` | `messageId` | 含义 |
|-------|---------------------|----------------|-------------|------|
| error1 | null | null | null | send: user 未落库；retry: 早期失败（权限/验证，`retry_ack` 之前） |
| error2 | 已设置 | null | 非 null | send: user 已落库；retry: 验证通过（`retry_ack` 已发） → defer 保证 error assistant 已落库 |
| error3 | — | 已设置 | 非 null | 首 token 已到达 |

> **error2 保证**：send 的 user 落库后 / retry 的 `retry_ack` 发出后，所有失败路径
> 后端 defer 统一先写 error assistant 再发 SSE error，**始终携带 `message_id`**。
> 因此 `confirmUserMsgRef` 已设置时 `messageId` 一定非 null，`messageId!` 非空断言安全。
>
> **send/retry 区分**：`confirmUserMsgRef.current.tempMsgId` 为 null 时是 retry（无 user 需要 confirm），
> 非 null 时是 send（需要 confirm user message）。

```typescript
// ---------- 当前 ----------
onError: (messageId, UserMsgId, error) => {
    flushTokenBuffer();
    if (!streamCtxRef.current) {
        if(confirmUserMsgRef.current) {
            dispatch(confirmUserMessage(...));
        }
        dispatch(removeAssistantPlaceholder({ msgId: tempAsstId }));
    }
    if (messageId) {
        dispatch(errorStream({ msgId: messageId, error: error.message }));
    } else if(UserMsgId) {
        dispatch(errorMessage({ msgId: UserMsgId, error: error.message }));
    } else {
        dispatch(errorUserMessage({ tempMsgId: tempMsgId as string, error: error.message }));
    }
    setIsStreaming(false);
},

// ---------- 改为 ----------
onError: (messageId, UserMsgId, error) => {
    flushTokenBuffer();

    if (streamCtxRef.current) {
        // error3: 首 token 已到达，messageId 在 onToken 时已拿到
        dispatch(errorStream({ msgId: messageId!, error: error.message }));
    } else if (confirmUserMsgRef.current && messageId) {
        // error2: send user 已落库 / retry 验证通过，后端一定返回 message_id
        const { tempMsgId: uTempId, msgId: uRealId } = confirmUserMsgRef.current;
        if (uTempId && uRealId) {
            // send 场景：confirm user message
            dispatch(confirmUserMessage({ conversationId, tempMsgId: uTempId, msgId: uRealId }));
        }
        dispatch(confirmAssistantMessage({ conversationId, tempMsgId: tempAsstId, msgId: messageId! }));
        dispatch(errorStream({ msgId: messageId!, error: error.message }));
    } else {
        // error1: user 未落库 / retry 早期失败（retry_ack 之前），后端无 error assistant
        dispatch(removeAssistantPlaceholder({ msgId: tempAsstId }));
        if (tempMsgId) {
            dispatch(errorUserMessage({ tempMsgId, error: error.message }));
        }
    }

    setIsStreaming(false);
},
```

**三阶段处理说明**：
- **error1**（`confirmUserMsgRef` 未设置）：后端无任何落库（send: 权限校验/CreateMessage 失败；retry: 权限校验/user message 验证失败，即 `retry_ack` 之前）。移除 assistant placeholder；如果有 tempMsgId（send 场景），将 user 消息标记为幽灵消息。
- **error2**（`confirmUserMsgRef` 已设置 + `messageId` 非 null）：send user 已落库 / retry 已过验证 → defer 保证 error assistant 已落库。通过 `tempMsgId` 是否为 null 区分 send（confirm user + confirm assistant）和 retry（仅 confirm assistant）+ errorStream。
- **error3**（首 token 已到达）：`messageId` 在 onToken 时已获取，直接 errorStream 停止输出。

---

### 7. `useChatStream.ts` onAbort — 利用预传的 `assistantMsgId` confirm

**文件**：`front-end/src/feature/chat/useChatStream.ts` (当前 line 128-145)

后端改造后，abort 始终写入 aborted assistant（含空内容）。
前端通过 `user_message`（send）或 `retry_ack`（retry）事件预获取 `assistantMsgID`，
abort 时直接 confirm assistant placeholder，**无需 remove + reload**。

```typescript
// ---------- 当前 ----------
onAbort: (messageId: string | null) => {
    flushTokenBuffer();
    // token 到达前取消，移除占位消息
    if (!streamCtxRef.current) {
        if(confirmUserMsgRef.current) {
            dispatch(confirmUserMessage({ conversationId, tempMsgId: confirmUserMsgRef.current.tempMsgId, msgId: confirmUserMsgRef.current.msgId }));
        }
        dispatch(removeAssistantPlaceholder({ msgId: tempAsstId }));
    }
    if (messageId) {
        // token到达后取消
        dispatch(abortStream({ msgId: messageId }));
    } else if (tempMsgId) {
        // 用户确认消息前就取消，让本条user Message变成ghost message
        dispatch(errorUserMessage({ tempMsgId, error: "" }));
    }
    // else: retry模式下token到达前取消
},

// ---------- 改为 ----------
onAbort: (messageId: string | null) => {
    flushTokenBuffer();

    if (streamCtxRef.current) {
        // abort3: 首 token 已到达，confirmAssistantMessage 已在 onToken 中完成
        dispatch(abortStream({ msgId: messageId! }));
    } else if (confirmUserMsgRef.current) {
        // abort2: send user 已落库 / retry 已过验证 → 预传的 assistantMsgId 可用
        const { tempMsgId: uTempId, msgId: uRealId, assistantMsgId: asstId } = confirmUserMsgRef.current;
        if (uTempId && uRealId) {
            // send 场景：confirm user message
            dispatch(confirmUserMessage({ conversationId, tempMsgId: uTempId, msgId: uRealId }));
        }
        dispatch(confirmAssistantMessage({ conversationId, tempMsgId: tempAsstId, msgId: asstId }));
        dispatch(abortStream({ msgId: asstId }));
    } else {
        // abort1: send user 未落库 / retry 早期失败（retry_ack 之前）
        dispatch(removeAssistantPlaceholder({ msgId: tempAsstId }));
        if (tempMsgId) {
            dispatch(errorUserMessage({ tempMsgId, error: "" }));
        }
    }

    setIsStreaming(false);
},
```

**分阶段说明**：
- **abort3**（首 token 已到达）：`confirmAssistantMessage` 已在 `onToken` 中完成，直接 `abortStream`。
- **abort2**（`confirmUserMsgRef` 已设置，无 token）：send 和 retry 统一处理。通过 `tempMsgId` 是否为 null 区分：send 需要 confirm user，retry 不需要。confirm assistant（使用预传的 `assistantMsgId`）+ abortStream。前端 `currentLeafId` 指向已确认的 assistant，与后端 DB 一致。
- **abort1**（`confirmUserMsgRef` 未设置）：send user 未落库 / retry 早期失败。移除 placeholder；send 场景标记 user 为幽灵消息。

> **关键改进**：旧方案 abort2 只能 `removeAssistantPlaceholder`，导致前端 `currentLeafId` 指向 user message，
> 后端 `currentLeafID` 指向 aborted assistant，下次发送 `parent_id` 不一致产生连续 user。
> 新方案通过 `user_message` 事件预传 `assistantMsgId`，abort2 可直接 confirm，前后端 `currentLeafId` 对齐。

---

### 8. `AssistantMessage.tsx` — error/aborted 状态处理 ✅ 已实现

**文件**：`front-end/src/ui/canvas/ChatNode/Message/AssistantMessage.tsx`

三种特殊情况：
- **aborted + 空内容** → `return null`，不渲染（后端过滤时也会跳过这对）
- **error + 空内容** → Sparkles 图标 + ErrorBlock + ActionBlock（跳过 markdown 内容区域）
- **error + 有内容** → 正常渲染内容 + ErrorBlock + ActionBlock

`showActions` 扩展为 `completed | aborted | error`。
ErrorBlock 放在 ActionBlock 上方，仅 `status === "error"` 时出现。
Sparkles 图标始终渲染（包括 isEmptyError 场景）。

---

## 数据流变化对比

### 场景 A：AI error + 无 token（#5 #6）

```
修复前：
  DB:  root → u1 → a1 → u2(completed)              ← 孤儿, leaf = u2
  下次发送 u3: chatMessages = [u1, a1, u2, u3]     ← 连续 user → Claude 400

修复后：
  DB:  root → u1 → a1 → u2(completed) → a2(error, "")   ← 成对, leaf = a2
  下次发送 u3: 回溯 = [u1, a1, u2, a2(error), u3]
    → 过滤 (u2, a2) → chatMessages = [u1, a1, u3]       ← 严格交替 ✓
```

### 场景 B：早期失败 — injectParentContext / hardTruncate / StreamChat（#1 #2 #3）

```
修复前：
  DB:  root → u1 → a1 → u2(completed)              ← 孤儿, leaf = u2
  前端：user 标记 error，leaf 未回退

修复后：
  DB:  root → u1 → a1 → u2(completed) → a2(error, "")   ← defer 兜底写入
  前端当次：defer 统一发送 SSE error（带 message_id）
    → error2 路径：confirmUser + confirmAssistant + errorStream
    → 前端即时显示 error 状态 ✓
```

### 场景 C：用户 retry

```
  DB:  root → u1 → a1 → u2 → a2(error, "")
                               ↓ retry
                              a2'(completed, "AI回答...")   ← a2 的 sibling
  leaf 更新为 a2' → 正常流程 ✓
```

### 场景 D：用户 abort（abort2：user 已落库，无 token）

```
修复前：
  DB:  root → u1 → a1 → u2 → a2(aborted, "")       leaf = a2
  前端：removeAssistantPlaceholder → currentLeafId = u2
  用户继续发送 → parent_id = u2 → DB: u2 → u3(user)  ← 连续 user → Claude 400

修复后（user_message 事件预传 assistantMsgId）：
  DB:  root → u1 → a1 → u2 → a2(aborted, "")       leaf = a2
  前端：confirmAssistant(assistantMsgId) → currentLeafId = a2
  用户继续发送 → parent_id = a2 → DB: a2 → u3(user)  ← 严格交替 ✓
```

### 场景 E：retry abort（abort2：验证通过，无 token）

```
修复前（无 retry_ack 事件）：
  DB:  root → u1 → a1 → u2 → a2(error, "")
                               ↓ retry
                              a2'(aborted, "")     leaf = a2'
  前端：removeAssistantPlaceholder → currentLeafId = u2
  用户继续发送 → parent_id = u2 → DB: u2 → u3(user)  ← 连续 user → Claude 400

修复后（retry_ack 事件预传 assistantMsgId）：
  DB:  root → u1 → a1 → u2 → a2(error, "")
                               ↓ retry
                              a2'(aborted, "")     leaf = a2'
  前端：confirmAssistant(assistantMsgId) → currentLeafId = a2'
  用户继续发送 → parent_id = a2' → DB: a2' → u3(user)  ← 严格交替 ✓
```

---

## TODO 清单

> **Phase 依赖关系**：Phase 1 → Phase 2（DB 中已有 error/aborted assistant 后才需要读取端过滤）；Phase 1 → Phase 3（后端 SSE 携带 message_id 后前端才能利用）；Phase 4 已完成，无依赖。Phase 1+2 可合并为一次后端提交，Phase 3 为一次前端提交。

### Phase 1: 后端写入端 — DTO + defer 兜底（核心修复）

#### Phase 1.1: DTO 准备
- [x] **`dto/chat.go`**：`ErrorData` 增加 `MessageID string` 字段
- [x] **`dto/chat.go`**：新增 `UserMessageEvent` 结构体（嵌入 `FullMessage` + `AssistantMsgID int64`）
- [x] **`dto/chat.go`**：新增 `RetryAckEvent` 结构体（`AssistantMsgID int64`）

#### Phase 1.2: SendMessage defer 机制
- [x] 将 `assistantMsgID := idgen.GenID()` 提前到 CreateMessage 之后、user_message SSE 之前
- [x] 修改 `user_message` SSE 事件：使用 `dto.UserMessageEvent` 携带 `assistantMsgID`
- [x] 添加 `assistantWritten` flag + `deferErrMsg` 变量 + `writeErrAssistant` 闭包
- [x] 注册 defer：写入 error assistant + 发送 SSE error（带 message_id）
- [x] 删除原 line 207 的 `assistantMsgID := idgen.GenID()`
- [x] 早期失败分支（UpdateCurrentLeafID / injectParentContext / hardTruncate / StreamChat）：删除 `eventCh <- SSEEvent{error}`，改为设置 `deferErrMsg` + `return`
- [x] `case "error"` 分支：调用 `writeErrAssistant`，显式发送 SSE error（带 messageID）
- [x] timeout 分支：调用 `writeErrAssistant`，显式发送 SSE error（带 messageID）
- [x] abort 分支：调用 `writeErrAssistant`（无需 SSE）
- [x] `case "complete"` 成功后：设置 `assistantWritten = true`
- [x] `case "complete"` 写入失败：删除 `eventCh <- SSEEvent{error}`，改为设置 `deferErrMsg` + `return`

#### Phase 1.3: RetryMessage defer 机制
- [x] user message 验证通过后（line 341 后）插入 `assistantMsgID` + `deferErrMsg` + defer 机制
- [x] defer 注册后发送 `retry_ack` SSE 事件：`dto.RetryAckEvent{AssistantMsgID: assistantMsgID}`
- [x] 早期失败分支（injectParentContext / hardTruncate / StreamChat）：同 SendMessage，删除 SSE error，设置 `deferErrMsg` + `return`
- [x] `case "error"` / timeout / abort 分支：同 SendMessage 模式
- [x] `case "complete"` 成功 / 失败：同 SendMessage 模式

#### Phase 1.4: 构建验证
- [x] `go build` 确认编译通过

---

### Phase 2: 后端读取端 — 过滤/防护

#### Phase 2.1: buildMessageChain 核心过滤
- [x] 步骤 3 之后添加过滤逻辑：空 content + error/aborted 的 assistant → 跳过 pair
- [x] 有内容但 error/aborted 的 assistant → 追加中断说明（同步更新 `msg.chatMsg.Content`）
- [x] 过滤结果仅用于构建 chatMessages，rawMessages 保持不变（步数对齐）

#### Phase 2.2: 轮次计数修正
- [x] **`countChatMsgRounds`**：跳过空 content assistant 轮次（`Content == ""`），不计入有效轮次

#### Phase 2.3: Fallback 链过滤
- [x] **`buildFallbackChain`**：在 `keepRecentRounds` 之前过滤空 content assistant 及其配对 user

#### Phase 2.4: Summary 防护
- [x] **`maybeTriggerSummary`**：`targetIdx` 计算后循环跳过空 content assistant，确保挂载目标有效
- [x] **`asyncGenerateMsgSummary`**：`summaryInput` 过滤掉空 content assistant 及其配对 user

#### Phase 2.5: 构建验证
- [x] `go build` 确认编译通过

---

### Phase 3: 前端 SSE + 状态管理

#### Phase 3.1: SSE 层
- [x] **`service/chat.ts`**：`user_message` 事件提取 `assistant_msg_id`，作为第二参数传给 `onUserMessage`
- [x] **`service/chat.ts`**：`retry_ack` 事件提取 `assistant_msg_id`，调用 `callbacks.onRetryAck`
- [x] **`service/chat.ts`**：SSE error 事件提取 `message_id`

#### Phase 3.2: Hook 层（依赖 3.1）
- [x] **`useChatStream.ts` → `onUserMessage`**：回调增加 `assistantMsgId` 参数，存入 `confirmUserMsgRef`
- [x] **`useChatStream.ts` → `onRetryAck`**：回调存入 `confirmUserMsgRef`（`tempMsgId`/`msgId` 为 null）
- [x] **`useChatStream.ts` → `onError`**：重构为三阶段互斥逻辑
  - [x] error3（首 token 已到达）：errorStream
  - [x] error2（`confirmUserMsgRef` 已设置 + messageId 非 null）：send 时 confirmUser + confirmAssistant + errorStream；retry 时仅 confirmAssistant + errorStream
  - [x] error1（`confirmUserMsgRef` 未设置）：removePlaceholder + errorUserMessage（如有 tempMsgId）
- [x] **`useChatStream.ts` → `onAbort`**：重构为三阶段互斥逻辑
  - [x] abort3（首 token 已到达）：abortStream
  - [x] abort2（`confirmUserMsgRef` 已设置）：send 时 confirmUser + confirmAssistant + abortStream；retry 时仅 confirmAssistant + abortStream
  - [x] abort1（`confirmUserMsgRef` 未设置）：removePlaceholder + errorUserMessage（如有 tempMsgId）

#### Phase 3.3: 构建验证
- [ ] `npm run build` 确认编译通过

---

### Phase 4: 前端 UI（✅ 已完成）

- [x] **`AssistantMessage.tsx`**：
  - [x] `showActions` 增加 `error` 状态
  - [x] Sparkles 始终渲染；空内容 error → ErrorBlock + ActionBlock；aborted + 空内容 → return null
