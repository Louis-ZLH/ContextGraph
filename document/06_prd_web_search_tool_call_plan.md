# AI Web Search & URL Reader — 架构设计 & TODO Plan

## 一、整体目标

为 AI 聊天系统加入 Web Search 能力。通过 LLM Tool Call 循环机制，让 AI 在需要实时信息时自主调用两个工具：

- **web_search**（Tavily API）：搜索网络获取相关结果
- **url_reader**（Jina Reader API）：读取特定 URL 的完整内容

LLM 自行判断是否需要使用工具，按需搜索、阅读 URL 后生成回答。前端实时展示搜索/阅读状态，最终回答流式输出。

---

## 二、核心设计决策

### 2.1 Tool 定义

两个工具以各 Provider 原生格式传给 LLM，统一定义如下（ai-service 内部转换）：

```json
[
  {
    "name": "web_search",
    "description": "Search the web for current information, recent events, or data that may not be in your training data. Use this when the user asks about current events, recent developments, or any topic requiring up-to-date information.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The search query, in the language most likely to yield good results"
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "url_reader",
    "description": "Read and extract the main content from a specific URL. Use this when you need to access the full content of a web page, such as reading an article, documentation, or any web resource.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "description": "The complete URL to read (must start with http:// or https://)"
        }
      },
      "required": ["url"]
    }
  }
]
```

**Tool 始终包含在 LLM 请求中**，由 LLM 自行判断是否使用。Token 开销约 300-500 tokens/次，可接受。

### 2.2 Tool Call 循环机制

**Tool Call Loop 在 ai-service（Python）内部实现。** Go 只发一次请求，ai-service 内部处理完整的 tool call 循环，通过同一条 SSE 流向外输出所有事件。

```
用户发消息
  → Go 组装上下文（现有逻辑不变）
  → Go 调用 ai-service StreamChat（一次 HTTP 请求）
  → ai-service 内部 Tool Call Loop：

  Loop（最多 MAX_TOOL_ROUNDS = 5 轮）：
    调用 LLM（含 tools 参数）
    流式输出 text tokens → SSE token 事件（Go 实时转发到前端）
    流结束时检查：
      ■ 无 tool calls（stop）→ 发送 complete 事件，结束 Loop
      ■ 有 tool calls → 执行以下步骤：
        ① 发送 tool_call SSE 事件（如 "正在搜索: latest AI news"）
        ② 执行工具（Tavily / Jina HTTP 调用）
        ③ 将 assistant message + tool results 追加到内存 messages
        ④ 继续 Loop，调用下一轮 LLM

  Loop 结束后：
    → 发送 complete SSE 事件
    → token 用量计算：
      - prompt_tokens = 所有轮次的 (prompt + completion) 之和 − 最终轮 completion
      - completion_tokens = 仅最终轮的 completion_tokens
      即：中间轮的全部开销归入 prompt_tokens，completion_tokens 只反映最终回答

  Go 收到 complete → 保存 assistant message（累积的文本）到 DB
```

**为什么 Tool Call Loop 在 Python 而非 Go：**

- Python LLM SDK（anthropic、openai、google-genai）原生支持 tool call 解析，不需要手动拼 JSON
- 各 Provider 的 tool call 格式差异大（Claude tool_use content block / OpenAI tool_calls array / Gemini function_call），Python 端已有 Provider 适配逻辑，在同一层处理最内聚
- 单一 SSE 连接：Go 只打开一个 HTTP 流，不需要每轮重新建连
- 工具执行（HTTP 调用）在 Python 中用 httpx 几行代码，不需要 Go 端资源（DB 等）
- Go 端零循环逻辑，只需转发新增的 `tool_call` 事件类型

### 2.3 Streaming 与 Tool Call 的协调

**所有轮次均使用流式调用**，text tokens 实时转发到前端：

- 第 1 轮：LLM 可能输出 "我来搜索一下最新信息。" + tool_call(web_search)
  - 文本 tokens 实时推送，用户看到 AI 的"思考过程"
  - tool_call 在流结束时由 ai-service 检测并处理
- 中间轮：LLM 读取搜索结果后可能进一步调用 url_reader
  - 同样流式推送文本
- 最后一轮：LLM 输出最终回答，无 tool calls
  - 正常流式输出

**前端累积所有轮次的文本**，形成完整的 assistant 消息。

eg:
```
Round 1 text: "好的，我来帮你搜索最新的 AI 新闻。"  ← 实时流式显示
              + tool_call(web_search)
              + tool_call SSE 事件
              ← 执行搜索 →
Round 2 text: "根据搜索结果，以下是最新动态：\n1. ..."  ← 实时流式显示

最终存 DB: "好的，我来帮你搜索最新的 AI 新闻。\n\n根据搜索结果，以下是最新动态：\n1. ..."
```

**ai-service 事件控制：**

- `token` 事件：每轮都输出，Go 直接转发到前端
- `tool_call` 事件：工具开始执行时输出，携带描述文本，Go 直接转发
- `complete` 事件：仅最终轮输出，携带跨轮累加的 token 用量
- 中间轮的流结束由 ai-service 内部消化，不对外暴露

### 2.4 各 Provider Tool Call 适配（ai-service 内部）

| Provider | Tool 定义格式 | Tool Call 返回格式 | Tool Result 消息格式 |
|----------|--------------|-------------------|---------------------|
| Claude | `tools: [{name, description, input_schema}]` | `content: [{type: "tool_use", id, name, input}]` | `{role: "user", content: [{type: "tool_result", tool_use_id, content}]}` |
| OpenAI/GPT | `tools: [{type: "function", function: {name, description, parameters}}]` | `tool_calls: [{id, function: {name, arguments}}]` | `{role: "tool", tool_call_id, content}` |
| Gemini | `tools: [Tool(function_declarations=[...])]` | `parts: [{function_call: {name, args}}]` | `parts: [{function_response: {name, response}}]` |
| DeepSeek | 同 OpenAI | 同 OpenAI | 同 OpenAI |

**所有格式转换在 ai-service 内部完成**，Go 端完全不感知 Provider 差异。

**流式 tool call 解析（ai-service 内部）：**

Tool call 的 arguments 在流式响应中以 chunk 形式到达，ai-service 需要累积完整的 arguments 后再执行工具：

```python
# Claude: content_block_delta(input_json_delta) → 累积 → content_block_stop 时得到完整 tool call
# OpenAI: delta.tool_calls[i].function.arguments → 累积 → finish_reason="tool_calls" 时得到完整 tool call
# Gemini: function_call 通常完整返回（不分 chunk）
```

### 2.5 Tool 执行器（ai-service 内部）

**新建 `ai-service/services/tool_executor.py`：**

#### web_search — Tavily API

- 接口：`POST https://api.tavily.com/search`
- 请求体：

```json
{
  "api_key": "tvly-xxx",
  "query": "latest AI news",
  "search_depth": "basic",
  "max_results": 5,
  "include_answer": false
}
```

- 结果格式化（返回给 LLM 的 tool result 文本）：

```
Search results for: "latest AI news"

1. [Title One]
   URL: https://example.com/article1
   Content: First 1000 characters of the snippet...

2. [Title Two]
   URL: https://example.com/article2
   Content: First 1000 characters of the snippet...

(5 results)
```

- 超时：15s
- 每条 content snippet 截断到 1000 字符

#### url_reader — Jina Reader API

- 接口：`GET https://r.jina.ai/{url}`
- Headers：`Accept: text/plain`，可选 `Authorization: Bearer {jina_api_key}`
- 结果截断：最大 15000 字符（约 5000 tokens）
- 截断时末尾追加 `[...内容已截断]`
- 超时：15s

#### 错误处理

工具执行失败时，返回错误信息字符串给 LLM（如 `"Error: search request timed out, please try again or answer based on your knowledge"`），让 LLM 自行决定是否重试或直接回答。不中断 Loop。

### 2.6 SSE 事件设计

**新增一个 SSE 事件类型（ai-service → Go → 前端）：**

| 事件类型 | Data 结构 | 触发时机 |
|---------|----------|---------|
| `tool_call` | `{"type": "tool_call", "content": "Web Searching: latest AI news"}` | ai-service 开始执行工具时 |

现有事件不变：`token`、`complete`、`error`

`tool_call` 事件的 `content` 字段为人类可读的状态描述文本，由 ai-service 根据工具类型和参数生成：
- web_search → `"Web Searching: {query}"`
- url_reader → `"Reading: {url}"`

**事件时序示例（含 tool call 的完整流程）：**

```
← Go 端已有的 SSE 事件 →
SSE: user_message  {user_msg, assistant_id}
SSE: thinking

← ai-service 输出的 SSE 事件流（Go 透传） →
SSE: token         "我来搜索一下"
SSE: token         "最新的 AI 新闻。"
SSE: tool_call     {content: "正在搜索: latest AI news 2024"}
    ← ai-service 内部：执行 Tavily 搜索，拿到结果，注入 LLM 上下文，调用第二轮 →
SSE: token         "根据搜索结果，"
SSE: token         "以下是最新的..."
SSE: token         "..."
SSE: complete      {prompt_tokens: 1500, completion_tokens: 800}

← Go 端已有的 SSE 事件 →
SSE: title         "最新 AI 新闻"
```

### 2.7 前端展示

**复用现有 `WaitingStatus` 组件展示 tool_call 状态，将其显示周期从 waiting 延长到 streaming 结束：**

```
[waiting]     🔄 Thinking...                              ← 现有 WaitingStatus
[streaming]   Let me search for that.                     ← 正常 token 流式输出
[tool_call]   Let me search for that.
              🔄 Web Searching: "latest AI news"          ← tool_call 事件，WaitingStatus 重新出现
              ← ai-service 执行工具 →
[next token]  Let me search for that.
              Based on search results, here are...        ← statusText 清除，WaitingStatus 消失
[complete]    Let me search for that.
              Based on search results, here are...        ← 最终完成
```

**实现方式：**

- **`AssistantMessage.tsx`**：将 WaitingStatus 从 `isWaiting ? WaitingStatus : MarkdownRenderer` 互斥改为共存
  ```tsx
  <>
    {!isWaiting && (
      <div className={...}>
        <MarkdownRenderer content={displayedContent} ... />
        {isStreaming && <cursor />}
      </div>
    )}
    {(isWaiting || (isStreaming && message.statusText)) && (
      <div className="flex items-center gap-2 py-1">
        <Loader2 ... />
        <WaitingStatus statusText={message.statusText} />
      </div>
    )}
  </>
  ```
- **`chatSlice.ts`**：`updateWaitingStatus` 去掉 `status !== "waiting"` guard，改为允许 `waiting` 或 `streaming`
- **`useChatStream.ts`**：收到 `tool_call` 事件 → `dispatch(updateWaitingStatus(statusText))`；收到 `token` 事件 → 清除 statusText
- **不污染消息内容**：statusText 是 UI 瞬态，不存入 content，历史加载时无 tool call 状态
- 实现极简：不需要 `ToolCallRecord` 类型、不需要 `addToolCall` / `updateToolCallStatus` reducer

### 2.8 消息存储

**DB 不做任何 schema 变更。**

- **user message**：正常存储（现有逻辑不变）
- **assistant message**：Content 字段存储所有轮次累积的最终文本（完整回答）
- **tool call 中间消息不存 DB**：
  - assistant message（content=null, 只有 tool_calls）→ 仅存在于 ai-service Python 进程内存
  - tool result message（role=tool）→ 仅存在于 ai-service Python 进程内存
  - 这些中间消息只服务于单次 tool call loop，loop 结束即丢弃

**历史上下文**：后续对话的 `buildMessageChain` **不需要任何改动**。它只看到最终的 assistant content 文本。Tool call 的信息已融入最终回答，不会导致上下文膨胀。

### 2.9 安全与限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 最大 Tool Call 轮数 | 5 | 防止无限循环，覆盖 search → read → search → read → answer |
| 单轮最大 Tool Calls | 3 | `asyncio.gather` 并行执行，防止并发过多 |
| 单次 Tool 执行超时 | 15s | 防止 hang |
| Tavily 结果数上限 | 5 | 控制 token 消耗 |
| Tavily 单条 snippet 上限 | 1000 字符 | 控制 token 消耗 |
| Jina 内容上限 | 15000 字符 | 约 5000 tokens，控制 context 占用 |
| Tool Call Loop 总超时 | 120s | 整个 tool loop 阶段的兜底超时（ai-service 端控制） |

---

## 三、接口变更

### 3.1 ai-service 接口变更

**`POST /api/chat/completions` 请求不变：**

```json
{
  "messages": [
    {"role": "user", "content": "最新的 AI 新闻是什么？"}
  ],
  "model": 1
}
```

ai-service 始终注入 web_search + url_reader 工具定义，LLM 自行判断是否调用。无需 `tools` 开关字段。

前端web_search按钮仅装饰，后续可以考虑加上注入system prompt强调。

**SSE 响应新增事件：**

```
data: {"type": "token", "content": "我来搜索一下。"}
data: {"type": "tool_call", "content": "正在搜索: latest AI news"}
    ← ai-service 内部执行工具 + 下一轮 LLM 调用 →
data: {"type": "token", "content": "根据搜索结果，..."}
data: {"type": "complete", "prompt_tokens": 1500, "completion_tokens": 800}
```

`prompt_tokens` = 所有中间轮的 (prompt + completion) + 最终轮的 prompt。`completion_tokens` = 仅最终轮的 completion。中间轮的生成开销全部归入 prompt_tokens。

### 3.2 Go 后端接口变更

**改动极小，仅 SSE 解析新增一个 case：**

**SSEEvent 新增 tool_call 类型解析（aiClient.go）：**

在 `StreamChat` 的 event switch 中加一个 case：

```go
case "tool_call":
    out = AIStreamEvent{Type: "tool_call", Content: event.Content}
```

**conversationService.go：**

收到 `tool_call` 事件时，取消 `firstTokenTimer`（与 token 相同逻辑）+ 直接转发到前端 SSE。无需任何循环逻辑。

**不需要新增/改动：**
- ❌ StreamChatReq 无需变更（无 tools 字段）
- ❌ ToolExecutor
- ❌ ChatMessage 的 ToolCalls / ToolCallID 字段
- ❌ config.go 的 Tavily / Jina API key
- ❌ Message 表 schema 变更
- ❌ dto 的 ToolCallData / ToolResultData

### 3.3 前端接口变更

**SSE 事件处理（chat.ts）复用 `onStatusChange` callback：**

```typescript
case "summarizing":
case "thinking":
case "tool_call":               // ← 新增，复用现有 onStatusChange
    callbacks.onStatusChange?.(parsed.content);
    break;
```

**useChatStream.ts 无需新增 callback**，现有 `onStatusChange` 已经 dispatch `updateWaitingStatus`。只需：
- `chatSlice.ts` 放宽 guard（允许 `streaming` 状态，详见 Phase 3）
- `onToken` 中清除 statusText（若存在）

**不需要新增：**
- ❌ `onToolCall` callback（复用 `onStatusChange`）
- ❌ ToolCallRecord 类型
- ❌ addToolCall / updateToolCallStatus reducer
- ❌ 历史消息 tool call 解析

---

## 四、TODO 清单

### Phase 1：ai-service — Tool 执行器 + Tool Call Loop

- [x] `requirements.txt` 新增 `httpx` 依赖（tool executor HTTP 调用使用）
- [x] `config.py` 新增 `tavily_api_key`、`jina_api_key` 配置项
- [x] 新建 `services/tool_executor.py`：
  - [x] `web_search(query)` → 调用 Tavily API，格式化结果为文本
  - [x] `url_reader(url)` → 调用 Jina Reader API，截断长内容（15000 字符）
  - [x] `execute(name, arguments)` → 统一调度入口，错误时返回错误文本
- [x] `llm.py` — `stream_chat` 始终注入工具定义，实现 Tool Call Loop：
  - [x] Claude Provider：
    - [x] tools 定义转换（`input_schema` 格式）
    - [x] 流式 tool_use 解析（累积 `input_json_delta` → 完整 tool call）
    - [x] tool_result 消息构建（`role: "user"`, `type: "tool_result"`）
  - [x] OpenAI Provider：
    - [x] tools 定义转换（`{type: "function", function: {...}}` 格式）
    - [x] 流式 tool_calls 解析（累积 arguments delta → 完整 tool call）
    - [x] tool result 消息构建（`role: "tool"`, `tool_call_id`）
  - [x] Gemini Provider：
    - [x] function_declarations 转换
    - [x] function_call 解析
    - [x] function_response 消息构建
  - [x] DeepSeek Provider（复用 OpenAI 逻辑）
  - [x] Loop 控制：最多 5 轮，每轮最多 3 个 tool calls（`asyncio.gather` 并行执行），120s 总超时
  - [x] token 用量计算：中间轮 prompt+completion 全部归入 prompt_tokens，completion_tokens 仅取最终轮
- [x] `chat.py` router 层：
  - [x] yield `tool_call` SSE 事件（`{"type": "tool_call", "content": "正在搜索: ..."}`）
  - [x] 仅最终轮 yield `complete` 事件（累计 token 用量）

### Phase 2：Go 后端 — 透传 tool_call 事件

- [x] `infra/aiClient.go`：
  - [x] `StreamChat` 的 SSE 解析 switch 新增 `tool_call` case
- [x] `service/conversationService.go`：
  - [x] 收到 `tool_call` 事件时：取消 `firstTokenTimer`（与 token 相同逻辑） + 转发到前端 SSE

### Phase 3：前端 — 复用 WaitingStatus 展示 tool_call 状态

- [x] `chat.ts`：SSE switch 新增 `tool_call` case，复用现有 `onStatusChange` callback
- [x] `useChatStream.ts`：
  - [x] `onToken` 中清除 statusText（若存在）
- [x] `chatSlice.ts`：`updateWaitingStatus` 去掉 `status !== "waiting"` guard，允许 `waiting` 或 `streaming`
- [x] `AssistantMessage.tsx`：WaitingStatus 从互斥改为共存，streaming 期间有 statusText 时也显示

### Phase 4：测试 & 边界情况

- [ ] 测试：无 tool call 时行为与改动前完全一致（所有 Provider）
- [ ] 测试：单个 web_search tool call 正确执行和展示
- [ ] 测试：web_search → url_reader 链式调用正确执行
- [ ] 测试：tool 执行失败时 LLM 收到错误信息并正常回答
- [ ] 测试：达到最大轮数限制（5 轮）时正常终止
- [ ] 测试：各 Provider（Claude / OpenAI / Gemini / DeepSeek）tool call 格式正确
- [ ] 测试：Tavily API 返回结果格式化正确
- [ ] 测试：Jina Reader 长内容截断正确（15000 字符）
- [ ] 边界：tool call loop 超时（120s）时正常终止并返回已有内容

---

## 五、关键设计决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| **Tool Call Loop 位置** | ai-service（Python） | Python SDK 原生支持 tool call；单一 SSE 流；Go 端零循环逻辑；Provider 格式差异在同一层处理最内聚 |
| **Tool 执行位置** | ai-service（Python） | 工具执行只是 HTTP 调用（Tavily / Jina），不需要 Go 端 DB 或业务资源 |
| **中间消息存储** | 不存 DB，仅 Python 进程内存 | tool / assistant(tool_use) 消息只服务于单次 loop，loop 结束即丢弃；DB 只存最终 user + assistant 文本 |
| **Go ↔ ai-service 的 tools 接口** | 始终注入，无开关字段 | Go 请求体不变；ai-service 内部始终注入 tool 定义，LLM 自行判断是否使用 |
| **tool_call SSE 事件** | `{type: "tool_call", content: "正在搜索: xxx"}` | 纯文本描述，前端直接展示即可；不需要结构化的 tool name / arguments / status |
| **Web Search 提供商** | Tavily API | 专为 AI Agent 设计，API 简单，结果质量高 |
| **URL Reader 提供商** | Jina Reader (r.jina.ai) | 零依赖 HTTP GET，返回干净 Markdown，免费额度充足 |
| **Tool 启用方式** | 始终包含 tool 定义 | Token 开销小（~300-500），LLM 自行判断是否使用 |
| **流式处理** | 所有轮次流式，token 实时转发 | 用户即时看到 AI 思考过程（如 "让我搜索一下"），不增加感知延迟 |
| **DB schema** | 不变 | 不需要 tool_calls 列，不需要 migration |
| **buildMessageChain** | 不变 | 只看到最终 assistant 文本，tool call 信息已融入回答 |
| **最大轮数** | 5 | 防止无限循环，覆盖 search → read → search → read → answer |
| **Tool 结果截断** | Tavily 1000 字符/条，Jina 15000 字符 | 控制 token 消耗，防止 context 溢出 |
| **Tool 执行失败处理** | 返回错误文本给 LLM | LLM 自行决策是否重试或直接回答，不中断 Loop |

---

## 六、实现注意事项

### 6.1 多轮文本拼接 — 插入分隔符

多轮 tool call 场景下，第 1 轮输出如 `"我来搜索一下"`，第 2 轮输出 `"根据搜索结果..."`，两轮文本在前端会自然拼接。ai-service 在开始新一轮 LLM 调用、yield 第一个 token 之前，应**主动 yield 一个 `\n\n` token**，防止不同轮次的文本粘连。

```python
# ai-service tool call loop 伪代码
for round in range(MAX_TOOL_ROUNDS):
    if round > 0:
        yield "\n\n"  # 轮次间分隔
    async for token in llm_stream(...):
        yield token
```

### 6.2 Tool 执行期间连接保活

工具执行（Tavily / Jina HTTP 调用）可能耗时最多 15s，期间 SSE 连接无数据流。当前架构下：

- Go stream client 无内置 timeout（ctx-controlled），不会主动断开 — **OK**
- 前端 fetch 无 idle timeout — **OK**

**风险点**：如果部署经过 Nginx / CDN 代理，proxy_read_timeout 默认 60s，通常不会触发。但如果遇到连接被中间件切断的情况，可在 ai-service 的工具执行期间发送 SSE comment 作为 heartbeat：

```python
# 可选：工具执行期间 keepalive
yield {"comment": "keepalive"}  # SSE comment，不会被前端解析为事件
```

**当前判断：暂不需要实现，部署后观察是否有超时断连再补。**

### 6.3 用户中途 Abort（Tool 执行期间）

用户在工具执行期间点击 Stop 时的传播链路：

```
前端 AbortController.abort()
  → fetch 断开
  → Go ctx.Done() 触发
  → Go 关闭到 ai-service 的 HTTP 流
  → FastAPI/Starlette 检测到 client disconnect
  → event_generator 被 cancel
```

FastAPI 的 `EventSourceResponse` 在 client disconnect 时会 cancel generator，但需确保：

- ai-service 的 tool executor（httpx 调用）使用了带 cancel 的 context，避免 orphan HTTP 请求
- `asyncio.gather` 并行执行工具时，cancel 能正确传播到所有子任务

**建议**：tool executor 的 httpx 调用传入 `timeout=httpx.Timeout(15.0)` 并 respect asyncio cancellation。Phase 4 中加入 abort 测试用例。

### 6.4 `onToken` 清除 statusText — 条件性 Dispatch

plan 要求收到 token 时清除 statusText（WaitingStatus 消失）。为避免每个 token 都触发无意义的 Redux dispatch：

```typescript
// useChatStream.ts — onToken callback
onToken: (token: string) => {
    // 仅当 statusText 存在时才 dispatch 清除
    if (currentStatusTextRef.current) {
        dispatch(clearWaitingStatus({ msgId }));
        currentStatusTextRef.current = null;
    }
    bufferToken(token);
}
```

用 ref 追踪当前 statusText 状态，避免每个 token 都读 Redux store 或 dispatch。

### 6.5 stream_chat 返回类型扩展

当前 `llm.stream_chat` 返回 `AsyncGenerator[str | TokenUsage, None]`。加入 tool call loop 后，需要额外 yield `tool_call` 事件。建议扩展返回类型：

```python
@dataclass
class ToolCallEvent:
    content: str  # "Web Searching: latest AI news"

# stream_chat 返回类型变为：
AsyncGenerator[str | TokenUsage | ToolCallEvent, None]
```

`chat.py` 的 `event_generator` 根据 yield 类型分发不同 SSE 事件，保持接口清晰。
