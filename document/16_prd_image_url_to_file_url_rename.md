# 16 消息文件持久化字段重命名：image_url → file_url

> **前置条件：15.2 AI 文件/图片生成核心功能已完成。**
>
> 15.2 已完成：`create_image` / `create_file` Tool Call、MinIO 写入、Go 内部接口注册、SSE 事件链、messages 表 `image_url` 字段持久化（方案 B）。

---

## 一、背景与动机

15.2 引入 `image_url` 字段时，仅用于**图片类型文件**（PNG、SVG）的消息持久化。非图片类型的 `create_file` 产物（CSV、JSON、MD、TXT）不写入 `image_url`，用户只能通过 Canvas 上的 ResourceNode 查看/下载。

实际使用中发现两个问题：

1. **语义不准确**：`image_url` 字段名暗示"仅存图片 URL"，但实际上所有 AI 生成的文件（含非图片类型）都应该在消息中持久化引用链接，以便用户加载历史消息时能直接查看/下载
2. **非图片文件丢失引用**：用户离开对话后重新载入，CSV / JSON / MD / TXT 类型的文件在消息中无法展示，只能去 Canvas 上找对应的 ResourceNode，体验不一致

### 目标

- 将 messages 表 `image_url` 字段重命名为 `file_url`，语义上覆盖所有文件类型
- `create_file` 对于**所有**文件类型（含非图片类型）都将 `file_url` 写入数据库
- 前端加载历史消息时，根据 `file_url` + `file_name` 扩展名决定渲染方式（图片 → `<img>`，非图片 → 文件卡片 / 下载链接）
- 同步持久化 `file_name`，使历史消息加载时前端能正确判断文件类型

### 不在本次改动范围内

代码中存在另一组语义不同的 `image_url`，属于 **LLM API content block 格式**（OpenAI 兼容的多模态内容块 `type: "image_url"`），与消息文件持久化无关，**不做任何修改**：

| 文件 | 位置 | 用途 |
|------|------|------|
| `internal/infra/aiClient.go` | `Type: "image_url"`、`ImageURL *ImageURL` struct | LLM content block 类型定义 |
| `internal/service/conversationService.go` | L923–924, L1048–1049 `Type: "image_url"` | 构建发给 LLM 的图片 content block |
| `internal/service/conversationService.go` | L1723 `case "image_url":` | 解析 LLM 返回的 content block |
| `ai-service/models/schemas.py` | `class ImageUrl` / `image_url: ImageUrl` | Python 端 content block 定义 |
| `ai-service/services/llm.py` | `block["type"] == "image_url"` | content block 解析与格式转换 |
| `ai-service/routers/chat.py` | L33–34 `block.type == "image_url"` | content block 序列化 |

---

## 二、核心设计变更

### 2.1 字段重命名总览

**重命名 `image_url` → `file_url`：**

| 层级 | 旧名称 | 新名称 | 说明 |
|------|--------|--------|------|
| DB column | `image_url` | `file_url` | messages 表 |
| Go model | `ImageURL *string` | `FileURL *string` | `internal/model/message.go` |
| Go DTO | `ImageURL` | `FileURL` | `internal/dto/chat.go` 中 4 个 struct |
| Go service | `capturedImageURL` | `capturedFileURL` | `conversationService.go` 局部变量 |
| Go service | `imageURL` (返回值) | `fileURL` | `fileService.go` 返回值与局部变量 |
| Go handler | `imageURL` | `fileURL` | `internalHandler.go` 返回值与局部变量 |
| Python dataclass | `image_url: str` | `file_url: str` | `ResourceCreatedEvent` |
| Python SSE | `"image_url"` | `"file_url"` | `chat.py` 序列化 |
| Python tool | `result.get("image_url", "")` | `result.get("file_url", "")` | `tool_executor.py` |
| 前端 TS interface | `imageUrl?: string` | `fileUrl?: string` | `types.ts` Message |
| 前端 TS interface | `image_url: string` | `file_url: string` | `type.ts` ResourceCreatedData（注：前端实际未消费此字段，`onResourceCreated` 仅使用 `file_id`/`filename`/`content_type`，此处为类型定义同步） |
| 前端 Redux | `imageUrl` | `fileUrl` | `chatSlice.ts` / `useChatStream.ts` |

**新增 `file_name` 字段（用于前端历史消息加载时判断文件类型）：**

| 层级 | 新增字段 | 说明 |
|------|----------|------|
| DB column | `file_name TEXT` (nullable) | messages 表，新增列 |
| Go model | `FileName *string` | `internal/model/message.go` |
| Go DTO | `FileName *string` | `internal/dto/chat.go` 中 `Message` / `FullMessage` |
| Go service | `capturedFileName` | `conversationService.go`，从 `resource_created` 提取 |
| 前端 TS interface | `fileName?: string` | `types.ts` Message |
| 前端 Redux | `fileName` | `chatSlice.ts` / `useChatStream.ts` |
| 前端 FileCard | 删除 `/\/api\/file\//.test(src)` | 改为依赖 `filename` 扩展名判断 |

### 2.2 语义变更：去掉"仅图片"条件

**当前逻辑**（`fileService.go:RegisterAIGeneratedFile` 返回值）：

```go
// 仅 image/* 类型生成 URL
if strings.HasPrefix(contentType, "image/") {
    imageURL = fmt.Sprintf("/api/file/%d", fileID)
}
```

**变更后**：

```go
// 所有文件类型都生成 URL
fileURL = fmt.Sprintf("/api/file/%d", fileID)
```

这意味着 CSV、JSON、MD、TXT 文件也会在 `file_url` 中持久化 `/api/file/{file_id}`，assistant message 加载历史时可以直接引用。

### 2.3 前端渲染逻辑变更

#### 2.3.1 AssistantMessage State 3（历史加载）

**当前逻辑**：
```tsx
{/* State 3: History load — render from message.imageUrl */}
{!imagePreview && !generatedFiles?.length && message.imageUrl && (
  <FileCard src={message.imageUrl} />
)}
```

**变更后**：传入 `fileName`，使 `FileCard` 能通过扩展名判断文件类型：

```tsx
{/* State 3: History load — render from message.fileUrl + fileName */}
{!imagePreview && !generatedFiles?.length && message.fileUrl && (
  <FileCard src={message.fileUrl} filename={message.fileName} />
)}
```

#### 2.3.2 FileCard `isImage` 判断修复

**当前逻辑**（`FileCard.tsx`）：
```tsx
const isImage = src.startsWith("data:image/")
  || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename ?? "")
  || /\/api\/file\//.test(src);  // ← 问题：所有 /api/file/ URL 都被当作图片
```

此前只有图片文件才有 `image_url`，第三个条件不会误判。改为 `file_url` 后所有文件类型都携带 `/api/file/xxx` URL，非图片文件会被错误渲染为 `<img>`（破损图片）。

**变更后**：删除第三个兜底条件，依赖 `filename` 扩展名判断：
```tsx
const isImage = src.startsWith("data:image/")
  || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename ?? "");
```

> `FileCard` 已支持非图片文件渲染（`FileText` 图标 + 文件名 + 下载按钮），无需额外扩展。

### 2.4 SSE 事件格式变更

`resource_created` 事件 data 字段更名：

```json
{
  "type": "resource_created",
  "data": {
    "file_id": "111222333444555",
    "node_id": "abc123",
    "edge_id": "def456",
    "filename": "report.csv",
    "content_type": "text/csv",
    "chat_node_id": "ghi789",
    "message_id": "999888777",
    "position": { "x": 400, "y": 200 },
    "file_url": "/api/file/111222333444555"
  }
}
```

**关键区别**：`file_url` 对所有文件类型都非空（不再像 `image_url` 那样仅对 `image/*` 非空）。

### 2.5 DB Migration

**开发环境**（已有 `image_url` 列）：
```sql
ALTER TABLE messages RENAME COLUMN image_url TO file_url;
-- file_name 由 GORM AutoMigrate 自动创建，无需手动执行
```

**生产环境**（从未部署过 15.2，无 `image_url` 列）：
```sql
-- 无需手动 SQL，GORM AutoMigrate 会自动创建 file_url 和 file_name 列
```

> GORM AutoMigrate 不支持 RENAME COLUMN，因此开发环境需手动执行 RENAME SQL。生产环境因为从未有过 `image_url` 列，AutoMigrate 会直接按新 Model 创建 `file_url` + `file_name`。

### 2.6 写入时机

沿用 15.2 方案 B，流程无变化，字段名更改 + 新增 `file_name` 透传：

1. Go 内部接口 `RegisterAIGeneratedFile` 响应体返回 `file_url` 字段（**所有文件类型**都返回非空值）
2. ai-service 将 `file_url` 放入 `ResourceCreatedEvent`，通过 SSE 透传给 Go `conversationService`（`resource_created` 事件已有 `filename` 字段）
3. Go `conversationService` 在处理 `resource_created` 事件时，从 `RawData` 中提取 `file_url` 和 `filename`，暂存到局部变量 `capturedFileURL` / `capturedFileName`
4. 在 `case "complete":` 写入 assistant message 时，将 `capturedFileURL` 和 `capturedFileName` 一并写入 `FileURL` / `FileName` 字段
5. 在 `writeErrAssistant` 闭包中同样写入（已成功生成的文件不因流式中断而丢失）

---

## 三、逐文件变更清单

### Phase 1：Go 后端

#### 3.1 数据库 & Model

- [x] DB migration（仅开发环境）：`ALTER TABLE messages RENAME COLUMN image_url TO file_url;`（生产环境由 AutoMigrate 自动创建）
- [x] `file_name` 列由 GORM AutoMigrate 自动创建，无需手动 SQL
- [x] `internal/model/message.go`：`ImageURL *string` → `FileURL *string`（含 gorm tag 和 json tag）
- [x] `internal/model/message.go`：新增 `FileName *string \`gorm:"type:text" json:"file_name,omitempty"\``

#### 3.2 DTO（`internal/dto/chat.go`）

- [x] `Message` struct：`ImageURL *string` → `FileURL *string`
- [x] `Message` struct：新增 `FileName *string \`json:"file_name,omitempty"\``
- [x] `FullMessage` struct：`ImageURL *string` → `FileURL *string`
- [x] `FullMessage` struct：新增 `FileName *string \`json:"file_name,omitempty"\``
- [x] `ResourceCreatedData` struct：`ImageURL string` → `FileURL string`
- [x] `RegisterAIFileResponse` struct：`ImageURL string` → `FileURL string`

#### 3.3 Service（`internal/service/fileService.go`）

- [x] `RegisterAIGeneratedFile` 返回值：`imageURL string` → `fileURL string`
- [x] 去掉 `if strings.HasPrefix(contentType, "image/")` 条件判断，改为所有文件类型都生成 `fileURL = fmt.Sprintf("/api/file/%d", fileID)`
- [x] 更新注释：`// 9. Construct imageURL (only for image/* content types)` → `// 9. Construct fileURL for all file types`

#### 3.4 Service（`internal/service/conversationService.go`）

**SendMessage：**
- [x] `var capturedImageURL string` → `var capturedFileURL string`，新增 `var capturedFileName string`
- [x] 更新注释：`// 15.2: capture image_url ...` → `// capture file_url / file_name ...`
- [x] `resource_created` case：反序列化字段 `json:"image_url"` → `json:"file_url"`，赋值改为 `capturedFileURL`；新增提取 `filename` 赋值给 `capturedFileName`
- [x] 更新注释：`// Extract image_url from RawData ...` → `// Extract file_url and filename from RawData ...`
- [x] `case "complete":` 写入 `FileURL: ptrIfNonEmpty(capturedFileURL)`，新增 `FileName: ptrIfNonEmpty(capturedFileName)`
- [x] `writeErrAssistant` 闭包：同上

**RetryMessage（同 SendMessage 模式）：**
- [x] `var capturedImageURL string` → `var capturedFileURL string`，新增 `var capturedFileName string`
- [x] 更新注释
- [x] `resource_created` case：反序列化字段更名 + 新增提取 `filename`
- [x] `case "complete":` / `writeErrAssistant`：写入 `FileURL` + `FileName`

**modelToFullMessage：**
- [x] `ImageURL: m.ImageURL` → `FileURL: m.FileURL`，新增 `FileName: m.FileName`

#### 3.5 Handler

- [x] `internal/handler/conversationHandler.go`：消息列表映射 `ImageURL: message.ImageURL` → `FileURL: message.FileURL`，新增 `FileName: message.FileName`
- [x] `internal/handler/internalHandler.go`：`ImageURL: imageURL` → `FileURL: fileURL`（含返回值与局部变量名更改）

#### 3.6 Interface

- [x] `internal/handler/internalHandler.go`：`InternalFileService` interface 返回值 `imageURL string` → `fileURL string`

### Phase 2：Python AI 服务

- [x] `ai-service/services/tool_executor.py`：`ResourceCreatedEvent` dataclass 字段 `image_url: str` → `file_url: str`
- [x] `ai-service/services/tool_executor.py`：更新字段注释 `# non-empty for image types` → `# file access URL for all file types`
- [x] `ai-service/services/tool_executor.py`：更新 `_register_ai_file` docstring 中 `image_url` → `file_url`
- [x] `ai-service/services/tool_executor.py`：`create_image_stream` 中 `image_url=result.get("image_url", "")` → `file_url=result.get("file_url", "")`
- [x] `ai-service/services/tool_executor.py`：`create_file` 中 `image_url=result.get("image_url", "")` → `file_url=result.get("file_url", "")`
- [x] `ai-service/routers/chat.py`：SSE 序列化 `"image_url": item.image_url` → `"file_url": item.file_url`

> **注意**：Python 端对 `file_url` 为空字符串的情况无特殊过滤逻辑（`result.get("file_url", "")`），Go 后端去掉 `image/*` 条件后所有文件类型都返回非空值，Python 端会原样透传，无需额外逻辑修改。

### Phase 3：前端

**`src/service/chat.ts` 无需代码修改：**

该文件负责 SSE 事件解析与 API 响应处理。`complete` 事件（L136）、`user_message` 事件（L122）和 `getConversationHistory`（L15）均通过通用工具函数 `toCamelCase()` 自动将 Go 返回的 snake_case JSON key 转为 camelCase（如 `file_url` → `fileUrl`、`file_name` → `fileName`），无需手动映射。`resource_created` 事件（L156）直接使用 snake_case 类型 `ResourceCreatedData`（对应 `type.ts` 中的接口），也无需修改。

**字段重命名 `imageUrl` → `fileUrl`：**
- [x] `src/feature/chat/types.ts`：`Message` interface `imageUrl?: string` → `fileUrl?: string`；更新注释
- [x] `src/service/type.ts`：`ResourceCreatedData` interface `image_url: string` → `file_url: string`；更新注释
- [x] `src/feature/chat/chatSlice.ts`：`completeStream` action payload 和 reducer 中 `imageUrl` → `fileUrl`
- [x] `src/feature/chat/useChatStream.ts`：`onComplete` dispatch 中 `imageUrl: message.imageUrl` → `fileUrl: message.fileUrl`

**新增 `fileName` 字段：**
- [x] `src/feature/chat/types.ts`：`Message` interface 新增 `fileName?: string`
- [x] `src/feature/chat/chatSlice.ts`：`completeStream` payload 新增 `fileName`，reducer 中写入 `message.fileName`
- [x] `src/feature/chat/useChatStream.ts`：`onComplete` dispatch 新增 `fileName: message.fileName`

**渲染逻辑修复：**
- [x] `AssistantMessage/index.tsx`：State 3 改为 `<FileCard src={message.fileUrl} filename={message.fileName} />`
- [x] `AssistantMessage/FileCard.tsx`：`isImage` 判断删除 `/\/api\/file\//.test(src)` 条件，改为仅依赖 `filename` 扩展名判断

### Phase 4：测试

- [x] 测试：`create_image` 生成的 PNG 文件 `file_url` + `file_name` 正确写入 messages 表
- [x] 测试：`create_file` 生成的 SVG 文件 `file_url` + `file_name` 正确写入 messages 表
- [x] 测试：`create_file` 生成的 CSV/JSON/MD/TXT 文件 `file_url` + `file_name` 正确写入 messages 表（**新增覆盖**）
- [x] 测试：重新载入对话时，图片类文件通过 `fileName` 扩展名判断，正确渲染 `<img>` 卡片
- [x] 测试：重新载入对话时，非图片类文件通过 `fileName` 扩展名判断，正确渲染文件卡片（含文件名 + 下载功能）
- [x] 测试：流式中断/出错时，`writeErrAssistant` 正确写入 `capturedFileURL` + `capturedFileName`
- [x] 测试：`resource_created` SSE 事件中 `file_url` 字段对所有文件类型均为非空
- [x] 测试：无文件生成的对话行为与改动前完全一致（`file_url` / `file_name` 为 NULL）
- [x] 测试：已有历史数据中旧的 `file_url`（原 `image_url`）值正常读取和渲染（`file_name` 为 NULL 时 FileCard 回退为非图片卡片）——**已知降级，接受**

---

## 四、部署注意事项

1. **生产环境**：GORM AutoMigrate 会自动创建 `file_url` + `file_name` 列，无需手动 SQL
2. **开发环境**：部署前手动执行 `ALTER TABLE messages RENAME COLUMN image_url TO file_url;`
3. **全栈同步部署**：Go 后端、ai-service、前端必须同步部署，因为 SSE 事件中的字段名从 `image_url` 改为 `file_url`，任何一端不匹配都会导致字段读取为空
4. **向后兼容（已知降级，接受）**：开发环境中已有 messages 记录的 `file_url`（原 `image_url`）值格式不变（`"/api/file/xxx"`），无需数据迁移；`file_name` 为 NULL 时前端 FileCard 回退渲染为非图片卡片——原本正确显示为 `<img>` 的历史图片将降级为文件卡片，开发环境数据量极小，接受此降级

---

## 五、关键设计决策索引

| 决策项 | 选择 | 说明 |
|--------|------|------|
| 字段命名 | `file_url`（非 `attachment_url`、`resource_url`） | 与 `create_file` tool 名称一致，简洁明确 |
| 写入条件 | 所有 AI 生成文件都写入 `file_url`（去掉 `image/*` 限制） | 统一体验，用户加载历史时可直接访问所有类型的文件 |
| 写入时机 | 不变，沿用 15.2 方案 B（SSE 透传 + complete 时写入） | §2.6 |
| 新增 `file_name` | 持久化文件名，供前端判断文件类型 | 解决 State 3 历史加载时 FileCard 无法区分图片/非图片的问题 |
| 前端渲染 | 复用 `FileCard` 组件，依赖 `filename` 扩展名区分图片/非图片 | §2.3，删除 `/api/file/` 兜底判断 |
| DB migration | `RENAME COLUMN`（非 drop + add） | 保留已有数据，零数据迁移 |
| LLM content block `image_url` | 不修改 | 属于 OpenAI 兼容多模态格式，与消息持久化无关 |
