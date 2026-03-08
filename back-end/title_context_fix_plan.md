# Fix: Title 生成时机改为与 AI 流式回复并行

## Context

Title 目前在 `CreateConversation` 时同步生成，只用了用户的第一条纯文本 prompt，忽略了连接的上下文节点（图片等），导致 title 不准确。改为在 `SendMessage` 中与 `StreamChat` **并行**执行 title 生成，此时 `chatMessages` 已包含完整上下文（父节点摘要、文件内容等）。通过现有 SSE 通道推送 title 事件给前端。

由前端传入 `generate_title: true` 控制是否生成 title，仅在 `createConversation` 后的第一次 `sendMessage` 时传入，从源头保证只触发一次，无需 Redis 锁。DB 层使用 `WHERE title = ''` 条件更新兜底，即使极端情况下触发两次，也以先到的 title 为准。

## 修改

### 1. 后端 — `CreateConversation` 不再生成 title
**文件:** `back-end/internal/service/conversationService.go` (line 89-117)

- 删除 `s.ai.GenerateTitle(content)` 调用及相关错误处理
- 传空字符串 `""` 作为 title 给 `CreateConversation` repo

### 2. 后端 — DTO: SendMessageRequest 添加 GenerateTitle 字段 + TitleData 事件
**文件:** `back-end/internal/dto/chat.go`

`SendMessageRequest` 添加字段：
```go
type SendMessageRequest struct {
    ConversationID string `json:"conversation_id" binding:"required"`
    ParentID       int64  `json:"parent_id,string" binding:"required"`
    Content        string `json:"content" binding:"required"`
    Model          int    `json:"model"`
    GenerateTitle  bool   `json:"generate_title"` // 新增
    ParentDelta
}
```

添加 `TitleData` struct：
```go
type TitleData struct {
    Title string `json:"title"`
}
```

### 3. 后端 — `SendMessage` 中并行生成 title
**文件:** `back-end/internal/service/conversationService.go`

在 `hardTruncate` 返回之后（line 251）、`StreamChat` 调用之前（line 260）：

```go
// 并行 title 生成（前端传入 generate_title=true 时触发）
var titleWg sync.WaitGroup
if req.GenerateTitle {
    titleWg.Add(1)
    go func() {
        defer titleWg.Done()
        titleCtx, titleCancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer titleCancel()
        title, err := s.ai.GenerateTitle(titleCtx, chatMessages)
        if err != nil {
            log.Printf("generate title error: %v", err)
            return
        }
        if err := s.conversationRepo.UpdateTitle(
            context.Background(), req.ConversationID, title,
        ); err != nil {
            log.Printf("update title error: %v", err)
            return
        }
        eventCh <- dto.SSEEvent{
            Type: "title",
            Data: dto.TitleData{Title: title},
        }
    }()
}
defer titleWg.Wait()
```

**关键设计点：**
- **前端传值控制**：`req.GenerateTitle` 由前端在首条消息时传 `true`，从源头保证只触发一次；DB 层 `WHERE title = ''` 兜底，极端竞态下以先到的 title 为准，最多浪费一次 token
- **`titleWg.Wait()`** 在 `defer close(eventCh)` 之后注册（LIFO），Wait 先执行、close 后执行，保证 goroutine 安全写入 eventCh
- **不影响前端加载状态**：前端依赖 `complete` 事件结束加载，而非 `[DONE]`。title goroutine 延迟关闭 eventCh 只影响 `[DONE]` 的发送时机，不会造成 UI 挂起
- **超时保护**：`context.WithTimeout(context.Background(), 30s)` 控制 AI 调用上限；使用 `context.Background()` 而非请求 ctx，确保用户断开不影响 title 持久化
- DB 更新使用独立的 `context.Background()`（无超时），与 AI 调用超时解耦

### 4. 后端 — `infra/aiClient.go` 改为多模态接口
**文件:** `back-end/internal/infra/aiClient.go`

`GenerateTitleReq` 改为接受 `[]ChatMessage`（与 `StreamChatReq` / `GenerateSummaryReq` 一致）：
```go
type GenerateTitleReq struct {
    Messages []ChatMessage `json:"messages"`
}
```

`GenerateTitle` 方法签名改为接受 `context.Context` + `[]ChatMessage`（与 `GenerateSummary` 一致），使用 `streamClient`（无内置超时）+ `http.NewRequestWithContext`，由调用方 context 控制超时：
```go
func (c *AIClient) GenerateTitle(ctx context.Context, messages []ChatMessage) (string, error) {
    body, err := json.Marshal(GenerateTitleReq{Messages: messages})
    if err != nil {
        return "", fmt.Errorf("marshal request: %w", err)
    }
    req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate-title", bytes.NewReader(body))
    if err != nil {
        return "", fmt.Errorf("create request: %w", err)
    }
    req.Header.Set("Content-Type", "application/json")
    resp, err := c.streamClient.Do(req)
    // ...其余逻辑不变
}
```

同时更新 service 层的 `ai` interface：
```go
GenerateTitle(ctx context.Context, messages []infra.ChatMessage) (string, error)
```

### 4.1 AI-service — 适配多模态 title 生成

#### `ai-service/models/schemas.py`
`GenerateTitleRequest` 改为接受 `messages`：
```python
class GenerateTitleRequest(BaseModel):
    messages: list[ChatMessage]  # 完整的 chatMessages（含图片等多模态内容）
```

#### `ai-service/routers/chat.py`
`generate_title` 端点转换 messages（与 `generate_summary` / `stream_chat` 相同模式）：
```python
@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(req: GenerateTitleRequest):
    messages = []
    for m in req.messages:
        if isinstance(m.content, str):
            messages.append({"role": m.role, "content": m.content})
        else:
            blocks = [_content_block_to_dict(b) for b in m.content]
            messages.append({"role": m.role, "content": blocks})
    try:
        title = await llm.generate_title(messages)
        return GenerateTitleResponse(title=title)
    except Exception as e:
        logger.exception("Failed to generate title")
        raise HTTPException(status_code=500, detail=str(e))
```

#### `ai-service/services/llm.py`
`generate_title` 改为接受 `list[dict]`，按 provider 处理多模态：
```python
async def generate_title(messages: list[dict]) -> str:
    """Generate a short conversation title from the conversation context."""
    entry = settings.utility_model
    provider = entry["provider"]
    model = entry["model"]

    system_prompt = (
        "Generate a title (MUST be 4-12 words, NEVER less than 4 words) for the following "
        "conversation. Return ONLY the title text, no quotes, no punctuation at the end.\n\n"
        "Good examples:\n"
        "- Python List Sorting Methods\n"
        "- How to Deploy on AWS\n"
        "- Debugging React State Issues\n"
        "- Best Practices for API Design\n\n"
        "Bad examples (TOO SHORT):\n"
        "- Python\n"
        "- Best\n"
        "- Sorting"
    )

    if provider == "claude":
        client = _get_claude_client()
        claude_messages = [
            {"role": msg["role"], "content": _convert_to_claude_content(msg["content"])}
            for msg in messages
        ]
        response = await client.messages.create(
            model=model, max_tokens=50, system=system_prompt,
            messages=claude_messages,
        )
        return response.content[0].text.strip()

    if provider == "gemini":
        client = _get_gemini_client()
        contents = [
            genai.types.Content(
                role="user" if msg["role"] == "user" else "model",
                parts=_convert_to_gemini_parts(msg["content"]),
            )
            for msg in messages
        ]
        response = await client.aio.models.generate_content(
            model=model, contents=contents,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=50, temperature=0.3,
            ),
        )
        return response.text.strip() if response.text else "New Chat"

    # OpenAI-compatible providers
    client = _get_openai_client(provider)
    # DeepSeek 不支持多模态 — 剥离图片
    if provider == "deepseek":
        messages = [
            {"role": msg["role"], "content": _strip_image_blocks(msg["content"])}
            for msg in messages
        ]
    oai_messages = [{"role": "system", "content": system_prompt}] + messages
    response = await client.chat.completions.create(
        model=model, messages=oai_messages,
        max_tokens=50, temperature=0.7,
    )
    return response.choices[0].message.content.strip()
```

**关键点：** 复用已有的 `_convert_to_claude_content`、`_convert_to_gemini_parts`、`_strip_image_blocks` 工具函数，与 `stream_chat` 保持一致的多模态处理逻辑。

### 5. 后端 — conversationRepo 添加 UpdateTitle
**文件:** `back-end/internal/repo/conversationRepo.go`

```go
func (r *ConversationRepo) UpdateTitle(ctx context.Context, conversationID string, title string) error {
    return r.db.WithContext(ctx).Model(&model.Conversation{}).
        Where("id = ? AND title = ''", conversationID).
        Update("title", title).Error
}
```

> **`WHERE title = ''` 兜底**：即使前端极端情况下连续发送两条带 `generate_title=true` 的消息，也只有第一次写入生效，后续写入因条件不满足而跳过（affected rows = 0），避免覆盖已生成的 title。

同时更新 service 层的 `conversationRepo` interface：
```go
UpdateTitle(ctx context.Context, conversationID string, title string) error
```

### 6. 前端 — chatSlice 添加 `updateConversationTitle` action
**文件:** `front-end/src/feature/chat/chatSlice.ts`

在 `reducers` 中添加：
```ts
updateConversationTitle: (state, action: PayloadAction<{ conversationId: string, title: string }>) => {
    const { conversationId, title } = action.payload;
    const conversation = state.conversations[conversationId];
    if (!conversation) return;
    conversation.title = title;
},
```

并在底部 export 中添加 `updateConversationTitle`。

### 7. 前端 — service 层添加 `generate_title` 支持 + `title` 事件解析
**文件:** `front-end/src/service/chat.ts`

`StreamCallbacks` 添加 `onTitle`：
```ts
export interface StreamCallbacks {
    // ...existing callbacks...
    onTitle?: (title: string) => void;  // title 异步生成完毕
}
```

`sendMessageStream` 添加 `generateTitle` 参数：
```ts
export function sendMessageStream(
    conversationId: string,
    content: string | null,
    model: number,
    parentId: string | null,
    isRetry: boolean,
    userMsgId: string | null,
    newParentNodes: DTONodeReadyToSend[],
    deletedParentNodeIds: string[],
    generateTitle: boolean, // 新增
    callbacks: StreamCallbacks,
): AbortController {
```

非 retry 请求体添加 `generate_title`：
```ts
const body = isRetry
    ? { conversation_id: conversationId, user_msg_id: userMsgId, model, ...parentDelta }
    : {
        conversation_id: conversationId, content, model, parent_id: parentId,
        ...(generateTitle && { generate_title: true }),
        ...parentDelta,
      };
```

SSE `onEvent` switch 中添加 `title` 分支：
```ts
case "title":
    callbacks.onTitle?.(event.data.title as string);
    break;
```

### 8. 前端 — useChatStream 串联 title 逻辑
**文件:** `front-end/src/feature/chat/useChatStream.ts`

添加 selector 读取当前会话 title（判断是否为首条消息）：
```ts
const conversationTitle = useAppSelector(
    state => state.chat.conversations[conversationId]?.title
);
```

在 `send` 函数中，计算 `generateTitle` 并传入 `sendMessageStream`：
```ts
const generateTitle = !conversationTitle && !isRetry;

controllerRef.current = sendMessageStream(
    conversationId, content, model, parentId, isRetry, UserMsgId,
    dtoParentNodes, deletedParentNodeIds,
    generateTitle, // 新增参数
    {
        // ...existing callbacks...
        onTitle: (title: string) => {
            dispatch(updateConversationTitle({ conversationId, title }));
        },
    },
);
```

**判断逻辑：** `!conversationTitle` — `CreateConversation` 改为传空字符串后，前端 conversation 的 title 为 `""` (falsy)，首条 `sendMessage` 时触发；title 生成后 `updateConversationTitle` 将其写入 state，后续消息 `conversationTitle` 非空，不再触发。`!isRetry` 防止 retry 时重复生成。

## 不需要修改的文件

- `back-end/internal/handler/conversationHandler.go` — handler 只是 `for range eventCh` 转发，不需要改

## TODO

### Phase A: 后端基础层（DTO + Repo + Infra）
> 纯数据结构、DB 操作和 AI 客户端接口，不涉及业务逻辑

- [x] `back-end/internal/dto/chat.go` — `SendMessageRequest` 添加 `GenerateTitle bool` 字段
- [x] `back-end/internal/dto/chat.go` — 添加 `TitleData` struct
- [x] `back-end/internal/repo/conversationRepo.go` — 添加 `UpdateTitle` 方法
- [x] `back-end/internal/service/conversationService.go` — `conversationRepo` interface 添加 `UpdateTitle`
- [x] `back-end/internal/infra/aiClient.go` — `GenerateTitleReq` 改为 `Messages []ChatMessage`
- [x] `back-end/internal/infra/aiClient.go` — `GenerateTitle` 签名改为 `GenerateTitle(ctx context.Context, messages []ChatMessage) (string, error)`，改用 `streamClient` + `http.NewRequestWithContext`
- [x] `back-end/internal/service/conversationService.go` — `ai` interface 中 `GenerateTitle` 签名同步更新

### Phase A.1: AI-service 适配（Python）
> 与 Go 后端 Phase A 配套，可并行开发

- [x] `ai-service/models/schemas.py` — `GenerateTitleRequest` 改为 `messages: list[ChatMessage]`
- [x] `ai-service/routers/chat.py` — `generate_title` 端点转换 messages（复用 `_content_block_to_dict`）
- [x] `ai-service/services/llm.py` — `generate_title` 改为接受 `list[dict]`，按 provider 处理多模态（复用 `_convert_to_claude_content` / `_convert_to_gemini_parts` / `_strip_image_blocks`）

### Phase B: 后端业务层（Service 改造）
> 依赖 Phase A 的 DTO、Repo 和 Infra

- [x] `back-end/internal/service/conversationService.go` — `CreateConversation` 删除 `GenerateTitle` 调用，title 传空字符串
- [x] `back-end/internal/service/conversationService.go` — `SendMessage` 中 `hardTruncate` 之后、`StreamChat` 之前，添加并行 title 生成 goroutine（`s.ai.GenerateTitle(chatMessages)` + `titleWg` + `defer titleWg.Wait()`）

### Phase C: 前端基础层（State + Service）
> 与后端 Phase A/B 完全解耦，可并行开发

- [x] `front-end/src/feature/chat/chatSlice.ts` — 添加 `updateConversationTitle` reducer + export
- [x] `front-end/src/service/chat.ts` — `StreamCallbacks` 添加 `onTitle` 回调
- [x] `front-end/src/service/chat.ts` — `sendMessageStream` 添加 `generateTitle` 参数，非 retry 请求体条件写入 `generate_title`
- [x] `front-end/src/service/chat.ts` — SSE `onEvent` 添加 `"title"` 分支，调用 `callbacks.onTitle`

### Phase D: 前端接入层（Hook 串联）
> 依赖 Phase C 的 action 和 service

- [x] `front-end/src/feature/chat/useChatStream.ts` — 添加 `conversationTitle` selector（`useAppSelector`）
- [x] `front-end/src/feature/chat/useChatStream.ts` — `send` 中计算 `generateTitle = !conversationTitle && !isRetry`，传入 `sendMessageStream`
- [x] `front-end/src/feature/chat/useChatStream.ts` — callbacks 添加 `onTitle`，dispatch `updateConversationTitle`

### Phase E: 验证
- [ ] 创建对话，观察 title 在流式回复过程中异步出现
- [ ] 连接图片资源节点后发送模糊消息（如"这是谁？"），验证 title 准确反映上下文
- [ ] 无父节点时 title 仍正常生成
- [ ] 第二条消息确认不会重复生成 title
