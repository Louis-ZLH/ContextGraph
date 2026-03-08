# AI Service API 文档

Base URL: `http://localhost:8001`

---

## 1. 健康检查

### `GET /health`

检查服务是否正常运行。

**Response**

```json
{ "status": "ok" }
```

---

## 2. 生成会话标题

### `POST /api/generate-title`

根据用户的第一条消息自动生成会话标题（最多 30 字符）。

**Request Body**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content` | string | 是 | 用户的第一条消息内容 |

```json
{
  "content": "帮我解释一下什么是 Context Graph"
}
```

**Response** `200`

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 生成的标题 |

```json
{
  "title": "Context Graph 概念解释"
}
```

**Error** `500`

```json
{
  "detail": "error message"
}
```

### Go 后端调用示例

```go
type GenerateTitleReq struct {
    Content string `json:"content"`
}

type GenerateTitleResp struct {
    Title string `json:"title"`
}

func generateTitle(content string) (string, error) {
    body, _ := json.Marshal(GenerateTitleReq{Content: content})
    resp, err := http.Post(
        "http://ai-service:8001/api/generate-title",
        "application/json",
        bytes.NewReader(body),
    )
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    var result GenerateTitleResp
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Title, nil
}
```

---

## 3. 流式聊天补全

### `POST /api/chat/completions`

以 SSE（Server-Sent Events）流式返回 LLM 生成的 token。

**Request Body**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `messages` | ChatMessage[] | 是 | — | 完整消息列表（由 Go 后端构建） |
| `model` | int | 否 | 0 | 模型索引 |

**ChatMessage**

| 字段 | 类型 | 说明 |
|---|---|---|
| `role` | string | `"system"` / `"user"` / `"assistant"` |
| `content` | string | 消息内容 |

**模型索引映射**

| model | 显示名 | Provider | API Model |
|---|---|---|---|
| 0 | Gemini 3.0 | Google Gemini | gemini-2.0-flash |
| 1 | Opus 4.5 | Anthropic Claude | claude-opus-4-5-20250929 |
| 2 | GPT-5 | OpenAI | gpt-4o |
| 3 | DeepSeek R1 | DeepSeek | deepseek-reasoner |

```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "你好" }
  ],
  "model": 0
}
```

**Response** `200` — SSE 事件流

每个事件的 `data` 字段为 JSON 字符串，有三种类型：

**token** — 逐 token 推送

```
data: {"type": "token", "content": "你"}
data: {"type": "token", "content": "好"}
data: {"type": "token", "content": "！"}
```

**complete** — 生成结束

```
data: {"type": "complete"}
```

**error** — 生成出错

```
data: {"type": "error", "message": "error description"}
```

### Go 后端调用示例

```go
type ChatMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type StreamChatReq struct {
    Messages []ChatMessage `json:"messages"`
    Model    int           `json:"model"`
}

type SSEEvent struct {
    Type    string `json:"type"`
    Content string `json:"content,omitempty"`
    Message string `json:"message,omitempty"`
}

func streamChat(w http.ResponseWriter, messages []ChatMessage, model int) error {
    body, _ := json.Marshal(StreamChatReq{Messages: messages, Model: model})
    resp, err := http.Post(
        "http://ai-service:8001/api/chat/completions",
        "application/json",
        bytes.NewReader(body),
    )
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    // 设置 SSE headers 转发给前端
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    flusher, _ := w.(http.Flusher)

    scanner := bufio.NewScanner(resp.Body)
    for scanner.Scan() {
        line := scanner.Text()
        if !strings.HasPrefix(line, "data: ") {
            continue
        }
        data := line[6:]

        var event SSEEvent
        json.Unmarshal([]byte(data), &event)

        switch event.Type {
        case "token":
            fmt.Fprintf(w, "data: %s\n\n", data)
            flusher.Flush()
        case "complete":
            fmt.Fprintf(w, "data: %s\n\n", data)
            flusher.Flush()
            return nil
        case "error":
            return fmt.Errorf("ai-service error: %s", event.Message)
        }
    }
    return scanner.Err()
}
```
