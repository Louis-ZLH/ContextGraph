# LLM 文件分析功能 — 架构设计 & TODO Plan

## 一、整体目标

让 LLM API 支持阅读并分析用户上传到 MinIO 的文件。ResourceNode 通过 edge 绑定到 ChatNode，作为父节点参与上下文组装。后端自动提取文件内容（文本或图片 base64），与其他父 ChatNode 的 summary 同级注入上下文。

---

## 二、核心设计决策

### 2.1 文件处理策略（按 ContentType 分流）

| ContentType                                                | 处理方式                                  | 送给 LLM 的格式 |
| ---------------------------------------------------------- | ----------------------------------------- | --------------- |
| `image/*`                                                  | 上传时压缩，直接从 MinIO 取               | base64          |
| `text/*`, `application/json`                               | 直接从 MinIO 读文本                       | text            |
| `application/pdf`                                          | 预处理：尝试提取文本，文本量不足则转图片  | text 或 base64  |
| DOCX (`application/vnd.openxmlformats...wordprocessingml`) | 预处理：提取文本（python-docx）           | text            |
| XLSX (`application/vnd.openxmlformats...spreadsheetml`)    | 预处理：提取为 Markdown table（openpyxl） | text            |
| PPTX (`application/vnd.openxmlformats...presentationml`)   | 预处理：转图片（排版即信息）              | base64          |

**判断 PDF 走文本还是图片的逻辑：**

- 尝试提取文本 → 文本长度 > 阈值（如 100 字符/页）→ 走文本
- 文本长度 ≤ 阈值 → 扫描件，走图片

**Office 文档文本优先策略：**

- DOCX：用 python-docx 提取文本，LLM 对纯文本理解精度远高于截图
- XLSX：用 openpyxl 提取为 Markdown table，数字精度 >> token 节省
- PPTX：直接转图片，排版和布局是核心信息，纯文本会丢失

**PPTX 转图片依赖 LibreOffice headless：** 仅在 ai-service Docker 容器中安装，不影响 Go 后端。转换流程：LibreOffice headless 将 PPTX 导出为 PDF → PyMuPDF 逐页渲染为图片。

**不支持旧版 Office 格式（.doc / .xls / .ppt）：** 上传时前后端均拒绝，提示用户转换为新版格式（.docx / .xlsx / .pptx）后重新上传。旧版格式解析不稳定且依赖复杂，不值得支持。

### 2.2 上传时校验（Go 后端同步）

- 文件大小 ≤ 5MB
- PDF 页数 ≤ 3（Go 端引入轻量 PDF 库如 `pdfcpu` 读页数）
- PPTX 页数 ≤ 5（通过 ZIP 结构读取 slide 数量）
- 文本类文件（text/\*、json）字符数上限 50KB（约 12,500-25,000 tokens，避免撑爆上下文，约 50,000 个字母
  或者 约 16,600 个汉字）
- DOCX 上传时通过 ZIP 读取 `word/document.xml` 估算文本量，超过 50KB 拒绝
- XLSX 上传时通过 ZIP 读取 `xl/sharedStrings.xml` 估算文本量，超过 50KB 拒绝
- 旧版 Office 格式（.doc / .xls / .ppt）上传时直接拒绝，返回错误提示用户转为新版格式
- 图片上传时压缩后再存 MinIO

### 2.3 预处理（异步，Python ai-service 执行）

**触发时机：** 文件上传成功后，Go 后端通过 RabbitMQ 发送异步任务给 ai-service

**RabbitMQ 拓扑设计：**

```
ai_exchange (topic)
├── ai.file.convert  →  file_convert_queue   (文件预处理)
├── ai.xxx.xxx       →  ...                  (未来其他 AI 任务)
└── (dead letter)    →  ai_dlx_exchange (fanout) → file_convert_dlq
```

- **Exchange：** `ai_exchange`，类型 `topic`，集中管理所有 AI 相关消息
- **Queue：** `file_convert_queue`，绑定 routing key `ai.file.convert`
- **Dead Letter：** `ai_dlx_exchange`（fanout）+ `file_convert_dlq`，接收被 reject 或超过重试次数的死信，用于排查问题

**声明职责：**

- Go 后端进程启动时：声明 `ai_exchange`（topic）
- Python ai-service 进程启动时：声明 `ai_exchange`（topic）+ `file_convert_queue` + 绑定 + DLX + DLQ
- 双方都做幂等声明，启动顺序无关

**生产者（Go 后端）：**

- 不开启 Publisher Confirm（文件已存入 MinIO，上传成功与消息投递无关）
- `channel.Publish()` 本身在连接断开/channel 关闭时会返回 error，已覆盖常见故障
- 连接断开时自动重连

**消费者（Python ai-service）：**

- 手动 ACK：处理完成（结果写入 MinIO + 删除 Redis key）后再 ACK
- 处理失败时根据情况 reject（进入 DLQ）或 requeue 重试
- `prefetch_count = 1`：文件转换是 CPU/IO 密集型，防止撑爆内存，同时方便未来多进程按劳分配
- 连接断开时自动重连

**消息体结构：**

```json
{
  "file_id": "uuid",
  "minio_path": "users/{user_id}/{uuid}_{filename}",
  "content_type": "application/pdf"
}
```

**处理内容（文本优先策略）：**

- PDF → 尝试提取文本（PyMuPDF），文本量不足则转图片（每页一张）
- DOCX → 提取文本（python-docx），存为 `_text.txt`
- XLSX → 提取为 Markdown table（openpyxl），存为 `_text.txt`
- PPTX → LibreOffice headless 导出 PDF → PyMuPDF 逐页渲染为图片，存入 `_pages/`

**提取文本统一截断（兜底）：**

- 所有提取的文本（PDF/DOCX/XLSX）写入 `_text.txt` 前，截断到 50KB 上限
- 截断时在末尾追加 `[...文本已截断]` 标记，让 LLM 知道信息不完整
- 与纯文本文件（text/\*、json）的上传限制保持一致，确保不撑爆上下文
- 上传时 Go 端已对 DOCX/XLSX 做了 ZIP 估算拦截，此处作为第二层兜底

**额外生成 summary（独立于文件转换，不阻塞 `file:processing`）：**

- 文件转换完成（`_text.txt` / `_pages/` 写入 MinIO）后，先 DEL `file:processing` + DEL `file:wait_to_process` → ACK，**释放阻塞锁**
- 然后检查提取文本量是否 > 10KB：
  - 是 → 调用 LLM 生成摘要 → 写入 `_summary.txt`
  - 否 → 跳过
- summary 生成失败不影响主流程（`wait_to_process` 已保证同一文件只会被一个 consumer 处理，无需额外幂等锁）
- 图片类文件（PPTX/扫描 PDF）暂不生成 summary
- **用户聊天时无需等待 summary 完成**：按 summary → txt → page 优先级取用，summary 不存在时自动退化到 txt 或 page

**结果存储（MinIO）：**

```
users/{user_id}/{uuid}_{filename}                    ← 原文件
users/{user_id}/{uuid}_{filename}_summary.txt        ← 文件摘要（文本 > 10KB 时异步生成）
users/{user_id}/{uuid}_{filename}_text.txt           ← 提取的文本（如有）
users/{user_id}/{uuid}_{filename}_pages/             ← 转换的图片目录（如有）
  page_1.jpg
  page_2.jpg
  ...
```

**上下文取用优先级（转换类型文件）：** `_summary.txt` → `_text.txt` → `_pages/`，哪个先存在用哪个。原始类型（image/\*、text/\*、json）直接用原文件。

**图片压缩标准（统一）：**

- 最大宽度 1568px（Claude 最优分辨率上限，其它模型也够用）
- 格式 JPEG quality=80
- 适用于：用户直接上传的图片 + 所有由文件转换出的图片

### 2.4 Redis Key 设计

本功能涉及两个 Redis key，职责不同：

#### ① `file:wait_to_process:{file_id}` — 业务幂等

**目的：** 防止消息重投递导致重复处理

**生命周期：**

1. Go 上传成功 → `SET file:wait_to_process:{file_id}`，**TTL = 5 分钟**（兜底，防止消息丢失或 consumer 挂掉导致 key 永远残留）
2. Publish RabbitMQ 消息
3. Python consumer 收到消息 → `GET file:wait_to_process:{file_id}`
   - key 存在 → 正常处理 → 处理完成 → `DEL key` → ACK
   - key 不存在 → 说明已被处理过（消息重投递场景） → 直接 ACK（幂等跳过）
4. 处理失败 → `DEL key` → reject 进入 DLQ（删掉 key 才能让后续重试或重新上传重新 SET）

#### ② `file:processing:{file_id}` — 阻塞锁

**目的：** 告知聊天引用方"文件正在处理中，请等待"，**仅覆盖文件转换阶段**（不包含 summary 生成）

**生命周期：**

1. Go 上传成功 → `SET file:processing:{file_id}`，**TTL = 5 分钟**（与 `wait_to_process` 同时设置，覆盖排队 + 文件转换全程）
2. Python consumer 文件转换完成（`_text.txt` / `_pages/` 已写入 MinIO）→ `DEL file:processing:{file_id}`
3. 处理失败 → `DEL file:processing:{file_id}`，key 不再残留
4. **summary 生成在 DEL 之后异步执行**，不占用阻塞锁时间

**聊天引用文件时的状态判断：**

- `file:processing:{file_id}` 存在 → 文件排队中或正在处理 → 轮询等待完成（间隔 500ms，最大等待 5s，超时返回错误并中止请求）
- 锁不存在 且 MinIO 有预处理结果 → 处理完成 → 正常取用
- 锁不存在 且 MinIO 无预处理结果 → 返回错误「文件解析异常，请重新上传文件」（消息丢失或处理失败）

### 2.5 文本缓存（Redis）

**两个缓存 key，职责分离：**

- `file:text_cache:{file_id}` — 缓存文件全文（原文或 `_text.txt`），TTL=24h
- `file:summary_cache:{file_id}` — 缓存 `_summary.txt` 内容，TTL=24h

**适用于：** 可提取文本的文件（text/\*、json、可提取文本的 PDF、DOCX、XLSX）

**流程：**

1. 聊天引用文件时，按优先级查 Redis 缓存：
   - 先查 `file:summary_cache:{file_id}` → hit 则直接用 summary
   - 未命中 → 查 `file:text_cache:{file_id}` → hit 则用全文
2. 全部 Cache miss → 从 MinIO 按优先级读取（`_summary.txt` → `_text.txt`），写入对应 Redis key
3. summary 可能因异步生成尚未完成而不存在，此时退化到 txt，正常行为

**图片不缓存 Redis：** base64 体积大，每次直接从 MinIO 取并转 base64。

### 2.6 上下文组装中的文件注入流程（Go 后端）

**ResourceNode 作为父节点，与 ChatNode summary 同级注入。** 不需要前端传 file_ids，edge 关系建立后自动生效。

**上下文结构（Go 组装后发给 ai-service 的 messages 数组）：**

```
[system prompt]                          ← ai-service 内部注入，Go 不管

① 父节点上下文（fake first turn）
  user:  [content blocks]               ← 遍历 node_edges 的所有父节点：
           - ChatNode 父节点 → text block（node summary）
           - ResourceNode 父节点 → text block（文件文本）或 image_url block（文件图片）
           - 末尾追加 text block："以上是本次聊天的前置知识"
  assistant: "好的，我已了解以上前置知识。"

② 早期对话 summary（fake second turn，如有）
  user:  "之前的对话摘要：..."
  assistant: "好的，我已了解之前的对话内容。"

③ 最近若干轮 raw messages
  user:  "..."
  assistant: "..."

④ 当前用户输入
  user:  "..."
```

**说明：**

- 父节点上下文放在 messages 最前面（system prompt 之后），作为 fake turn 注入
- image content blocks 只能放在 user 消息中（大部分 LLM 的 system message 不支持图片），所以用 fake user turn
- 没有父节点时跳过 ①，没有 summary 时跳过 ②
- Go 负责收集材料并组装为统一格式，Python 负责按具体模型适配

**文件内容获取流程：**

```
用户在 ChatNode 发消息
  → 查 node_edges WHERE target_id = 当前 ChatNode
  → 遍历每个父节点，判断节点类型：
      ChatNode → 取 node summary（走 summary 机制）
      ResourceNode → 根据文件 ContentType 获取内容：

        ■ 原始类型 — 直接使用原文件：
          text/*、json → Redis 查 file:text_cache:{file_id}
            → hit: 直接用
            → miss: 从 MinIO 读原文件文本 → 写 Redis → 用
          image/* → 直接从 MinIO 取图片 → 转 base64（上传时已压缩）

        ■ 转换类型（PDF、DOCX、XLSX、PPTX）— 先检查处理状态：
          检查 Redis 锁 file:processing:{file_id}
            → 有锁: 轮询等待（间隔 500ms，最大 5s，超时返回错误并中止请求）
            → 无锁: 按优先级取用预处理结果（哪个存在用哪个）：
              1️⃣ _summary.txt（最优，token 最省）
                 → Redis 查 file:summary_cache:{file_id}
                 → miss 则从 MinIO 取 → 写 Redis
              2️⃣ _text.txt（summary 尚未生成或生成失败时退化到此）
                 → Redis 查 file:text_cache:{file_id}
                 → miss 则从 MinIO 取 → 写 Redis
              3️⃣ _pages/（仅 PPTX 和扫描 PDF，无文本产物时）
                 → 从 MinIO 取图片 → 转 base64
              ❌ 以上均无 → 返回错误「文件解析异常，请重新上传文件」

  → 将文件内容作为 content blocks 注入 parent context 层级
  → 组装完整上下文，发送给 ai-service
```

**说明：** summary 异步生成，可能在用户首次聊天时尚未完成，此时自动退化到 txt 或 page。后续聊天如 summary 已就绪则自动升级。

### 2.7 消息结构改造

**Go → ai-service 的完整 payload 示例：**

```json
{
  "messages": [
    // ① 父节点上下文（fake first turn）
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "[父节点 ChatNode-A summary]\n用户之前讨论了项目架构设计..."
        },
        {
          "type": "text",
          "text": "[父节点 ResourceNode: report.pdf]\n---文件内容开始---\n提取的文本...\n---文件内容结束---"
        },
        {
          "type": "image_url",
          "image_url": { "url": "data:image/jpeg;base64,/9j/4AAQ..." }
        },
        { "type": "text", "text": "以上是本次聊天的前置知识" }
      ]
    },
    { "role": "assistant", "content": "好的，我已了解以上前置知识。" },

    // ② 早期对话 summary（fake second turn，如有）
    { "role": "user", "content": "之前的对话摘要：用户询问了 Go 并发模型..." },
    { "role": "assistant", "content": "好的，我已了解之前的对话内容。" },

    // ③ 最近若干轮 raw messages
    { "role": "user", "content": "goroutine 和 channel 的区别是什么？" },
    { "role": "assistant", "content": "goroutine 是轻量级线程..." },

    // ④ 当前用户输入
    { "role": "user", "content": "帮我分析一下这份报告的核心观点" }
  ],
  "model": 1
}
```

**说明：**

- 没有父节点时跳过 ①，没有 summary 时跳过 ②
- content 字段为 `string | list[ContentBlock]`，无文件时用 string，有文件/图片时用 list
- Go 只负责收集材料并组装为统一的 OpenAI 风格中间格式，不感知具体模型

**ai-service schema 改造：**

```python
class ImageUrl(BaseModel):
    url: str  # "data:image/jpeg;base64,..."

class ContentBlock(BaseModel):
    type: str                          # "text" | "image_url"
    text: str | None = None            # type=text 时
    image_url: ImageUrl | None = None  # type=image_url 时

class ChatMessage(BaseModel):
    role: str
    content: str | list[ContentBlock]  # 兼容：无文件时 str，有文件时 list
```

**ai-service 的 `stream_chat` 内部做 provider 适配（content 为 list 时）：**

- OpenAI: 原生支持上述格式，无需转换
- Claude: image_url block 转为 `{"type": "image", "source": {"type": "base64", "media_type": "...", "data": "..."}}`，text block 不变
- Gemini: image_url block 转为 `Part(inline_data=Blob(...))`，text block 转为 `Part(text=...)`
- DeepSeek: 不支持原生多模态，对于图片多模态类型的任务，在前端提醒用户更换模型

---

## 三、不需要新增 DB 字段

利用现有 File model 的 `filename` + `content_type` 判断处理路线，预处理结果通过 MinIO 路径约定存取，处理状态通过 Redis 锁管理。无需修改 File 表结构。

## 三（附）、文件清理（暂不实现）

当 ResourceNode 或文件被删除时，MinIO 上的预处理产物（`_text.txt`、`_pages/`、`_summary.txt`）会成为孤儿文件。当前阶段暂不处理，后续考虑引入异步清理任务：根据 ResourceNode 关联关系核对 MinIO 文件，清理无引用的预处理产物。Redis 缓存（`file:text_cache`、`file:summary_cache`）通过 TTL=24h 自动过期，无需主动清理。

---

## 四、TODO 清单

### Phase 1：上传校验强化（Go 后端）

- [x] 修改文件大小上限为 5MB
- [x] 引入 PDF 库（如 `pdfcpu`），上传 PDF 时校验页数 ≤ 3
- [x] PPTX 上传时校验页数 ≤ 5（通过 ZIP 结构读取 slide 数量）
- [x] 文本类文件（text/\*、json）上传时校验字符数 ≤ 50KB
- [x] DOCX 上传时通过 ZIP 读取 `word/document.xml` 估算文本量，超过 50KB 拒绝
- [x] XLSX 上传时通过 ZIP 读取 `xl/sharedStrings.xml` 估算文本量，超过 50KB 拒绝
- [x] 前后端拒绝旧版 Office 格式（.doc / .xls / .ppt），返回错误提示用户转为新版格式
- [x] 上传图片时进行压缩（最大宽度 1568px，JPEG quality=80）再存 MinIO

### Phase 2：异步预处理管线（ai-service + Go 后端）

**2a. RabbitMQ 基础设施**

- [x] Go 后端：进程启动时声明 `ai_exchange`（topic），连接断开自动重连
- [x] ai-service：进程启动时声明 `ai_exchange`（topic）+ `file_convert_queue`（绑定 `ai.file.convert`）+ `ai_dlx_exchange`（fanout）+ `file_convert_dlq`，连接断开自动重连
- [x] ai-service：消费者手动 ACK，`prefetch_count = 1`

**2b. 生产端（Go 后端）**

- [x] 文件上传成功后同时 `SET file:wait_to_process:{file_id}` + `SET file:processing:{file_id}`（均 TTL=5min）
- [x] Publish 消息到 `ai_exchange`，routing key `ai.file.convert`，消息体 `{file_id, minio_path, content_type}`
- [x] 不开启 Publisher Confirm，依赖 `Publish()` 返回 error 处理常见故障

**2c. 消费端（ai-service）**

- [x] 消费 `file_convert_queue`，收到消息后检查 Redis key 是否存在（幂等：key 不存在则直接 ACK 跳过）
- [x] 根据 content_type 分流执行预处理：
  - [x] PDF 文本提取（PyMuPDF），判断文本量是否足够，不足则转图片
  - [x] DOCX 文本提取（python-docx），存为 `_text.txt`
  - [x] XLSX 提取为 Markdown table（openpyxl），存为 `_text.txt`
  - [x] PPTX 转图片（LibreOffice headless → PDF → PyMuPDF 逐页渲染），存入 `_pages/`
- [x] 转换出的图片统一压缩（1568px，JPEG quality=80）
- [x] 提取的文本统一截断到 50KB 上限后再存储（兜底，截断时末尾追加 `[...文本已截断]` 标记）
- [x] 结果写入 MinIO 约定路径（`_text.txt` 或 `_pages/`）
- [x] 文件转换完成后 `DEL file:processing:{file_id}` + `DEL file:wait_to_process:{file_id}` → ACK（**先释放阻塞锁**）
- [x] 处理失败 → `DEL file:processing:{file_id}` + `DEL file:wait_to_process:{file_id}` → reject（进入 DLQ）
- [x] ACK 后异步生成 summary：文本 > 10KB → 调用 LLM 生成摘要 → 写 `_summary.txt`（失败不影响主流程）

### Phase 3：上下文组装中的文件注入（Go 后端）

- [x] 上下文组装时通过 node_edges 查父节点，区分 ChatNode 和 ResourceNode
- [x] ResourceNode：根据文件 ContentType 区分原始类型和转换类型
- [x] 原始类型 — text/\*、json：Redis 缓存 `file:text_cache:{file_id}`（TTL=24h），miss 时从 MinIO 读原文件
- [x] 原始类型 — image/\*：直接从 MinIO 取图片 → 转 base64
- [x] 转换类型 — 检查 `file:processing:{file_id}` 锁 → 轮询等待（500ms 间隔，最大 5s，超时中止）
- [x] 转换类型 — 按优先级取用：`_summary.txt`（Redis `file:summary_cache:{file_id}`）→ `_text.txt`（Redis `file:text_cache:{file_id}`）→ `_pages/`（图片转 base64）→ 全无则返回错误
- [x] 将文件内容作为 content blocks 与 ChatNode summary 同级注入 parent context

### Phase 4：ai-service 多模态支持

- [x] 改造 `ChatMessage` schema 为 `content: list[ContentBlock]`
- [x] 改造 `stream_chat`：Claude provider 适配多模态 content blocks
- [x] 改造 `stream_chat`：OpenAI provider 适配 image_url 格式
- [x] 改造 `stream_chat`：Gemini provider 适配 inline_data 格式
- [x] 改造 `stream_chat`：DeepSeek provider 过滤掉图片 blocks（如不支持）
- [x] 纯文本消息向后兼容（content 可接受 string 或 list）

### Phase 5：测试 & 边界情况

- [x] 测试：上传超限文件（>5MB、PDF>3页）被正确拒绝
- [x] 测试：各类型文件的预处理流程正确执行
- [ ] 测试：聊天引用文件时，文本/图片路线正确分流
- [ ] 测试：预处理未完成时，聊天引用文件正确阻塞等待
- [ ] 测试：Redis 文本缓存 hit/miss 逻辑
- [ ] 测试：多模态消息在各 LLM provider 下正确发送
- [ ] 边界：前端限制 ChatNode 父节点的种类和个数，避免上下文溢出
- [ ] 边界：转换类型文件按 summary → txt → page 优先级取用，验证各退化路径正确
- [ ] 测试：summary 异步生成期间聊天引用文件，正确退化到 txt/page
- [ ] 测试：summary 生成完成后再次聊天，正确使用 summary

---

## 五、关键设计决策记录

| 决策项                     | 选择                                                                       | 理由                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **处理策略分流依据**       | ContentType + filename                                                     | 已有字段，无需新增 DB 字段                                                                              |
| **上传校验位置**           | Go 后端同步校验                                                            | 失败立即返回，用户体验好                                                                                |
| **预处理执行者**           | Python ai-service                                                          | Python 生态有更好的文件处理库                                                                           |
| **预处理触发方式**         | RabbitMQ 异步                                                              | 不阻塞上传接口                                                                                          |
| **业务幂等**               | Redis key `file:wait_to_process:{file_id}`（TTL=5min）                     | Go 上传时 SET，Python 处理完 DEL，防止消息重投递导致重复处理。所有正常/异常路径均手动 DEL，TTL 仅作兜底 |
| **阻塞锁**                 | Redis key `file:processing:{file_id}`（TTL=5min），仅覆盖文件转换，不含 summary 生成 | Go 上传时 SET，文件转换完成即 DEL + ACK，summary 在锁释放后异步生成。所有路径均手动 DEL，TTL 仅作兜底   |
| **Publisher Confirm**      | 不开启                                                                     | 上传成功指文件存入 MinIO，与消息投递无关；`Publish()` error 已覆盖常见故障                              |
| **未处理完时的行为**       | 轮询等待（500ms 间隔，最大 5s），超时返回错误并中止请求                    | 5s 对用户体感可接受，超时好于无限阻塞                                                                   |
| **文本缓存**               | Redis TTL=24h                                                              | 文本提取有计算开销，缓存收益高                                                                          |
| **图片不缓存 Redis**       | 每次从 MinIO 取                                                            | base64 体积大，缓存性价比低                                                                             |
| **图片压缩标准**           | 1568px / JPEG q=80                                                         | Claude 最优分辨率，各 provider 通用                                                                     |
| **文件内容获取者**         | Go 后端                                                                    | 权限校验统一，ai-service 保持纯 LLM 职责                                                                |
| **多模态消息格式**         | ContentBlock list                                                          | 灵活支持 text + image 混合，各 provider 内部适配                                                        |
| **Office 文档文本优先**    | DOCX/XLSX 提取文本，PPTX 转图片（LibreOffice headless → PDF → PyMuPDF）    | 文本 LLM 理解精度高（尤其数字/表格），PPT 排版是核心信息需保留                                          |
| **PPTX 依赖 LibreOffice** | 仅在 ai-service Docker 容器中安装                                           | Go 后端不受影响，Docker 内可控，PPTX 渲染无其他可靠替代方案                                             |
| **不支持旧版 Office 格式** | 上传时拒绝 .doc / .xls / .ppt，提示用户转为新版格式                        | 旧版格式解析不稳定且依赖复杂，不值得支持                                                                |
| **文本上限双层保障**       | 上传时 Go 端 ZIP 估算 + 预处理时 ai-service 截断，统一 50KB                | DOCX/XLSX 压缩比高，5MB 文件解压后文本可能远超 50KB，单层不够                                           |
| **上下文取用优先级**       | 转换类型：summary → txt → page，哪个存在用哪个；原始类型直接用原文件       | summary 异步生成不阻塞聊天，首次可能退化到 txt/page，后续自动升级到 summary                             |
| **不引入 RAG**             | 限制文件大小和页数替代                                                     | 当前阶段复杂度可控，后续可升级                                                                          |
| **文件注入层级**           | parent context，与 ChatNode summary 同级                                   | ResourceNode 通过 edge 绑定，本质是父节点，统一走 node_edges 遍历                                       |
| **文件引用方式**           | 自动通过 edge 关系                                                         | 无需前端每次传 file_ids，edge 建立后自动生效                                                            |
