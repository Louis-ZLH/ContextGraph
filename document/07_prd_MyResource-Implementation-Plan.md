# "我的资源" (My Resources) 页面实现计划

## 背景
当前 `/canvas/myresource` 路由只有一个 `<div>My Resources</div>` 占位符。需要实现完整的"我的资源"页面，展示用户在所有 Canvas 中上传的文件，支持卡片网格视图、预览、下载和删除操作。

## 需求
- 展示用户上传的所有文件（跨所有 Canvas）
- 卡片网格布局，图片类文件直接展示缩略图
- 支持操作：查看（预览）、下载、删除
- 支持按文件名搜索
- 支持分页
- 适配三套主题（saas / dark / paper）

---

## 一、后端改动

### 1. DTO — `internal/dto/file.go`
新增两个响应结构体：

```go
// 文件列表中的单项
type FileListItem struct {
    FileID      int64  `json:"file_id,string"`
    Filename    string `json:"filename"`
    FileSize    int64  `json:"file_size"`
    ContentType string `json:"content_type"`
    CreatedAt   string `json:"created_at"`
}

// 文件列表响应（带分页）
type FileListResponse struct {
    Files []FileListItem `json:"files"`
    Total int64          `json:"total"`
    Page  int            `json:"page"`
    Limit int            `json:"limit"`
}
```

### 2. Repo — `internal/repo/fileRepo.go`
新增三个方法：

```go
// ListFilesByUser 分页查询用户的所有文件，支持按文件名模糊搜索
func (r *FileRepo) ListFilesByUser(ctx context.Context, userID int64, keyword string, page, limit int) ([]model.File, int64, error)

// DeleteFileByID 软删除文件记录 + 将绑定该文件的所有 Node 的 file_id 标记为 -1（已删除）
func (r *FileRepo) DeleteFileByID(ctx context.Context, fileID int64) error

// RemoveMinioObject 删除 MinIO 中的文件对象
func (r *FileRepo) RemoveMinioObject(ctx context.Context, minioPath string) error
```

**ListFilesByUser 实现逻辑：**
```go
func (r *FileRepo) ListFilesByUser(ctx context.Context, userID int64, keyword string, page, limit int) ([]model.File, int64, error) {
    var files []model.File
    var total int64

    query := r.db.WithContext(ctx).Model(&model.File{}).Where("user_id = ?", userID)
    if keyword != "" {
        // 转义 LIKE 通配符，防止用户输入 % 或 _ 产生非预期的模糊匹配
        escaped := strings.ReplaceAll(keyword, "%", "\\%")
        escaped = strings.ReplaceAll(escaped, "_", "\\_")
        query = query.Where("filename LIKE ?", "%"+escaped+"%")
    }

    if err := query.Count(&total).Error; err != nil {
        return nil, 0, apperr.Wrap(err, 500, apperr.BizUnknown, "查询文件总数失败")
    }

    offset := (page - 1) * limit
    if err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&files).Error; err != nil {
        return nil, 0, apperr.Wrap(err, 500, apperr.BizUnknown, "查询文件列表失败")
    }

    return files, total, nil
}
```

**DeleteFileByID 实现逻辑（事务）：**

> **设计决策：** 删除文件时，不将 Node 的 `file_id` 置为 NULL，而是设为哨兵值 `-1` 表示"文件已删除"。
> - 若置为 NULL，前端 ResourceNode 会进入 `"uploading"` 状态（永久转圈），用户会困惑。
> - 使用 `-1` 后，前端可识别为 `"deleted"` 状态并展示"文件已删除"提示，用户体验更清晰。
> - `file_id` 为自增 ID，不会自然产生 `-1`，无冲突风险。
> - 这与前端已有的 `"__error__"` 哨兵值模式一致（用于上传失败）。

```go
func (r *FileRepo) DeleteFileByID(ctx context.Context, fileID int64) error {
    return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        // 1. 将所有引用此文件的节点的 file_id 标记为 -1（已删除哨兵值）
        deletedSentinel := int64(-1)
        if err := tx.Model(&model.Node{}).Where("file_id = ?", fileID).
            Update("file_id", deletedSentinel).Error; err != nil {
            return apperr.Wrap(err, 500, apperr.BizUnknown, "标记节点文件已删除失败")
        }
        // 2. 软删除文件记录
        if err := tx.Delete(&model.File{}, fileID).Error; err != nil {
            return apperr.Wrap(err, 500, apperr.BizUnknown, "删除文件记录失败")
        }
        return nil
    })
}
```

**RemoveMinioObject 实现逻辑：**
```go
func (r *FileRepo) RemoveMinioObject(ctx context.Context, minioPath string) error {
    return r.minioClient.RemoveObject(ctx, r.bucket, minioPath, minio.RemoveObjectOptions{})
}
```

### 3. Service — `internal/service/fileService.go`

在 `FileRepo` 接口中新增方法声明：
```go
type FileRepo interface {
    // ... 已有方法 ...
    ListFilesByUser(ctx context.Context, userID int64, keyword string, page, limit int) ([]model.File, int64, error)
    DeleteFileByID(ctx context.Context, fileID int64) error
    RemoveMinioObject(ctx context.Context, minioPath string) error
}
```

新增两个业务方法：

```go
// ListFiles 获取用户文件列表
func (s *FileService) ListFiles(ctx context.Context, userID int64, keyword string, page, limit int) ([]model.File, int64, error) {
    return s.repo.ListFilesByUser(ctx, userID, keyword, page, limit)
}

// DeleteFile 删除文件（验证所有权 → 解绑节点 → 软删除 → 删除 MinIO）
func (s *FileService) DeleteFile(ctx context.Context, userID int64, fileID int64) error {
    // 1. 获取文件记录
    file, err := s.repo.GetFileByID(ctx, fileID)
    if err != nil {
        return err
    }
    // 2. 验证所有权
    if file.UserID != userID {
        return apperr.Forbidden("无权删除该文件")
    }
    // 3. 数据库事务：解绑节点 + 软删除
    if err := s.repo.DeleteFileByID(ctx, fileID); err != nil {
        return err
    }
    // 4. 删除 MinIO 对象（失败仅记日志，不影响主流程）
    //    注意：如果此步失败，MinIO 中会残留孤儿对象。
    //    后续可考虑补充定时清理任务，扫描已软删除但 MinIO 对象仍存在的记录进行回收。
    if err := s.repo.RemoveMinioObject(ctx, file.MinioPath); err != nil {
        log.Printf("[DeleteFile] RemoveMinioObject failed for fileID=%d path=%s: %v", fileID, file.MinioPath, err)
    }
    return nil
}
```

### 4. Handler — `internal/handler/fileHandler.go`

在 `FileService` 接口中新增方法声明：
```go
type FileService interface {
    // ... 已有方法 ...
    ListFiles(ctx context.Context, userID int64, keyword string, page, limit int) ([]model.File, int64, error)
    DeleteFile(ctx context.Context, userID int64, fileID int64) error
}
```

新增两个 handler 方法：

```go
// ListFiles GET /api/file/list?page=1&limit=20&keyword=xxx
func (h *FileHandler) ListFiles(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
        return
    }

    page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
    limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
    keyword := c.Query("keyword")

    if page < 1 { page = 1 }
    if limit < 1 { limit = 20 }
    if limit > 50 { limit = 50 }

    files, total, err := h.fileService.ListFiles(c.Request.Context(), userID.(int64), keyword, page, limit)
    if err != nil {
        if appErr, ok := apperr.GetAppError(err); ok {
            c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
            return
        }
        c.JSON(http.StatusInternalServerError, dto.Error(apperr.BizUnknown, "Internal Server Error"))
        return
    }

    items := make([]dto.FileListItem, len(files))
    for i, f := range files {
        items[i] = dto.FileListItem{
            FileID:      f.ID,
            Filename:    f.Filename,
            FileSize:    f.FileSize,
            ContentType: f.ContentType,
            CreatedAt:   f.CreatedAt.Format(time.RFC3339),
        }
    }

    c.JSON(http.StatusOK, dto.Success(dto.FileListResponse{
        Files: items,
        Total: total,
        Page:  page,
        Limit: limit,
    }))
}

// DeleteFile DELETE /api/file/:id
func (h *FileHandler) DeleteFile(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
        return
    }

    fileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "无效的文件ID"))
        return
    }

    err = h.fileService.DeleteFile(c.Request.Context(), userID.(int64), fileID)
    if err != nil {
        if appErr, ok := apperr.GetAppError(err); ok {
            c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
            return
        }
        c.JSON(http.StatusInternalServerError, dto.Error(apperr.BizUnknown, "Internal Server Error"))
        return
    }

    c.JSON(http.StatusOK, dto.SuccessMsg("文件已删除"))
}
```

### 5. AI 上下文组装 — `internal/service/conversationService.go`

在 `resolveParentContext` 方法中，ResourceNode 分支需跳过 `file_id == -1`（已删除）的节点，避免向 AI 发送无效的文件上下文。

**当前代码（约第 751 行）：**
```go
case "resourceNode":
    if n.FileID == nil {
        return
    }
    fileBlocks, err := s.getResourceNodeContent(ctx, *n.FileID, eventCh)
```

**改为：**
```go
case "resourceNode":
    if n.FileID == nil || *n.FileID == -1 {
        return
    }
    fileBlocks, err := s.getResourceNodeContent(ctx, *n.FileID, eventCh)
```

> 仅新增 `|| *n.FileID == -1` 条件，其余逻辑不变。SendMessage 和 RetryMessage 均通过 `assembleContext → resolveParentContext` 调用此处，一处修改覆盖两个入口。

### 6. 路由注册 — `internal/api/file.go`

**注意 Gin 路由顺序：** `/:id` 是通配符路由，必须放在 `/list` 之后，否则 `/list` 会被匹配为 `:id`。

> **提示：** 当前代码中已存在被注释掉的 `DELETE /:id` 路由，实施时取消注释并确认 handler 指向即可，无需重复添加。

```go
func NewFileRouter(api *gin.RouterGroup, a *app.App) {
    fileApi := api.Group("/file")
    fileApi.Use(middleware.AuthMiddleware(a.RDB, a.DB))

    fileApi.GET("/list", a.H.FileHandler.ListFiles)       // 新增 — 必须在 /:id 之前
    fileApi.POST("/upload", a.H.FileHandler.UploadFile)
    fileApi.GET("/:id", a.H.FileHandler.DownloadFile)
    fileApi.GET("/:id/info", a.H.FileHandler.GetFileInfo)
    fileApi.POST("/bind-node", a.H.FileHandler.BindFileToNode)
    fileApi.DELETE("/:id", a.H.FileHandler.DeleteFile)     // 取消注释已有行，指向新 handler
}
```

---

## 二、前端改动

### 1. 类型 — `src/service/type.ts`
新增接口：

```typescript
export interface FileListItem {
  fileId: string;
  filename: string;
  fileSize: number;
  contentType: string;
  createdAt: string;
}

export interface FileListResponse {
  files: FileListItem[];
  total: number;
  page: number;
  limit: number;
}
```

### 2. Service — `src/service/file.ts`
新增两个 API 调用函数：

```typescript
// 获取用户文件列表
export async function getFileList(params: { page?: number; limit?: number; keyword?: string })
  : Promise<{ success: boolean; message: string; data: FileListResponse | null }> {
  try {
    const query = new URLSearchParams();
    // 使用 !== undefined 判断，避免 page=0 或 limit=0 时被跳过
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.keyword) query.set("keyword", params.keyword);

    const response = await apiRequest<JSONResponse>(`/api/file/list?${query.toString()}`, {
      method: "GET",
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message, data: toCamelCase(response.data) as FileListResponse };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message, data: null };
    }
    return { success: false, message: "Failed to get file list", data: null };
  }
}

// 删除文件
export async function deleteFile(fileId: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await apiRequest<JSONResponse>(`/api/file/${fileId}`, {
      method: "DELETE",
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "Failed to delete file" };
  }
}
```

### 3. Query — 新建 `src/query/file.ts`

```typescript
import { queryOptions } from "@tanstack/react-query";
import { getFileList } from "../service/file";

export function fileListQueryOptions(params: { page: number; limit: number; keyword: string }) {
  return queryOptions({
    queryKey: ["file", "list", params],
    queryFn: () => getFileList(params),
    staleTime: 1000 * 60 * 2,  // 2 分钟
    retry: false,
  });
}
```

### 4. 页面组件 — 新建 `src/view/canvas/MyResource.tsx`

**组件结构：**
```
MyResource (主页面)
├── Header 区域
│   ├── 页面标题 "My Resources"
│   └── 搜索框（debounce 300ms）
├── 卡片网格区域（响应式 grid）
│   └── ResourceCard × N
│       ├── 图片缩略图 / FileTypeIcon
│       ├── 文件名（truncate）
│       ├── 文件大小 + 上传时间
│       └── Hover 浮层：下载 + 删除按钮
├── 加载骨架屏（isLoading 时）
├── 空状态
│   ├── 无文件：居中图标 + "还没有上传过文件" 文案
│   └── 搜索无结果：居中图标 + "未找到匹配的文件" 文案 + "清除搜索" 链接
├── 分页控件（上一页 / 页码 / 下一页）
└── 删除确认 Modal
```

**核心状态：**
- `page: number` — 当前页码，默认 1
- `keyword: string` — 搜索关键词（debounce 300ms 后生效）
- `deleteTarget: FileListItem | null` — 控制删除确认 Modal

**卡片设计细节：**
- 图片文件 → `<img src={BASE_URL}/api/file/${fileId} loading="lazy">` 展示缩略图，加载失败 fallback 到 `FileTypeIcon`
  - 使用 `loading="lazy"` 延迟加载，避免首屏同时加载大量图片
  - 卡片设置固定高度（如 `h-40`），使用 `object-cover` 防止布局抖动
  - **注意：** 当前接口返回原图，大尺寸图片加载较慢。后续可考虑在上传时生成缩略图优化
- 非图片文件 → 展示 `FileTypeIcon`（复用 `src/ui/canvas/ResourceNode/FileTypeIcon.tsx`）
- 文件大小 → 复用 `formatFileSize()`（已有）
- 文件分类 → 复用 `getFileCategoryFromMime()`（已有）
- 删除确认 → 复用 `Modal` 组件（`src/ui/common/Modal.tsx`）

**交互细节：**
- 搜索：onChange → debounce 300ms → setKeyword → page 重置为 1
- 预览（查看）：点击卡片 → `window.open(BASE_URL + "/api/file/" + fileId)` 在新标签页中打开，利用浏览器原生预览能力（图片直接显示、PDF 浏览器内置渲染）
- 下载：`window.open(BASE_URL + "/api/file/" + fileId + "?download=true")` 触发浏览器下载（后端通过 `download` query 参数设置 `Content-Disposition: attachment`）
- 删除：点击删除 → setDeleteTarget → Modal 确认 → `useMutation` 调用 `deleteFile` → `invalidateQueries(["file", "list"])` → toast 提示
- 分页：简单的"上一页 / 下一页"按钮 + 当前页码显示（如 "第 1 / 5 页"），不实现完整页码导航

**样式（Tailwind + CSS 变量）：**
```
- 页面背景: bg-[var(--bg-canvas)]
- 卡片背景: bg-[var(--node-bg)]
- 卡片边框: border border-[var(--border-main)]
- 文字颜色: text-[var(--text-primary)] / text-[var(--text-secondary)]
- 强调色: text-[var(--accent)]
- 网格布局: grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4
- hover 浮层: absolute inset-0 bg-black/40 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity
```

### 5. ResourceNode 已删除状态 — `src/ui/canvas/ResourceNode/index.tsx`

文件被删除后，对应 Node 的 `file_id` 会被后端设为 `-1`。前端需识别此状态并展示"文件已删除"UI，而非显示为永久上传中。

**状态判断改动（约第 22 行）：**

> **⚠️ 类型注意：** 当前 `fileId` 的类型是 `string | undefined`（来自 `data?.fileId`），而后端 Node 模型的 `file_id` 是 `*int64`（JSON tag 无 `string` 修饰符）。需要确认前端 canvas sync 流程中 node 数据经过 `toCamelCase` 等转换后，`fileId` 的实际运行时类型：
> - 如果是 **string** `"-1"` → 使用 `=== "-1"` 比较（如下方代码）
> - 如果是 **number** `-1` → 需要改用 `== -1`（宽松比较）或 `String(fileId) === "-1"`
>
> 实施前务必在浏览器 DevTools 中打印 `typeof fileId` 和 `fileId` 的值来确认，避免比较失败导致已删除文件无法正确显示状态。

当前：
```typescript
const status = fileId === "__error__" ? "error" : (fileId ? "success" : "uploading");
```

改为：
```typescript
const status = fileId === "__error__" ? "error"
             : fileId === "-1" ? "deleted"
             : fileId ? "success"
             : "uploading";
```

**新增 `status === "deleted"` 的 UI 渲染（Content 区域内）：**

```tsx
{/* 文件已删除 */}
{status === "deleted" && (
  <div className="flex flex-col items-center justify-center py-4 gap-2">
    <AlertCircle size={22} className="text-secondary" />
    <p className="text-xs text-secondary">File has been deleted</p>
  </div>
)}
```

> 样式与现有 `"error"` 状态类似，但使用 `text-secondary` 而非 `text-red-500`，表达"已失效"而非"出错"。

### 6. 路由更新 — `src/router/router.tsx`

```diff
+ import MyResource from "../view/canvas/MyResource";

  {
    path: "myresource",
-   element: <div>My Resources</div>,
+   element: <MyResource />,
  }
```

---

## 三、API 接口总结

| 方法 | 路径 | 参数 | 响应 |
|------|------|------|------|
| `GET` | `/api/file/list` | `?page=1&limit=20&keyword=xxx` | `{ code: 0, data: { files: [...], total, page, limit } }` |
| `DELETE` | `/api/file/:id` | URL param `id` | `{ code: 0, message: "文件已删除" }` |

---

## 四、涉及的文件清单

### 后端（修改已有文件）
| 文件 | 操作 |
|------|------|
| `internal/dto/file.go` | 新增 FileListItem、FileListResponse 结构体 |
| `internal/repo/fileRepo.go` | 新增 ListFilesByUser、DeleteFileByID、RemoveMinioObject 方法 |
| `internal/service/fileService.go` | FileRepo 接口新增 3 个方法声明 + 新增 ListFiles、DeleteFile 业务方法 |
| `internal/service/conversationService.go` | `resolveParentContext` 中 resourceNode 分支新增 `*n.FileID == -1` 跳过条件 |
| `internal/handler/fileHandler.go` | FileService 接口新增 2 个方法声明 + 新增 ListFiles、DeleteFile handler |
| `internal/api/file.go` | 注册 GET /list、DELETE /:id 路由，调整路由顺序 |

### 前端（修改 + 新建）
| 文件 | 操作 |
|------|------|
| `src/service/type.ts` | 新增 FileListItem、FileListResponse 类型 |
| `src/service/file.ts` | 新增 getFileList、deleteFile 函数 |
| `src/query/file.ts` | **新建** — fileListQueryOptions |
| `src/view/canvas/MyResource.tsx` | **新建** — 页面主组件 |
| `src/ui/canvas/ResourceNode/index.tsx` | 新增 `"deleted"` 状态判断 + "文件已删除" UI |
| `src/router/router.tsx` | import MyResource，替换占位符 |

### 复用已有组件/工具
| 组件/工具 | 路径 |
|-----------|------|
| `FileTypeIcon` | `src/ui/canvas/ResourceNode/FileTypeIcon.tsx` |
| `formatFileSize` | `src/service/file.ts` |
| `getFileCategoryFromMime` | `src/service/file.ts` |
| `Modal` | `src/ui/common/Modal.tsx` |
| `BASE_URL` | `src/util/api.ts` |
| `toCamelCase` | `src/util/transform.ts` |
| `apiRequest` | `src/util/api.ts` |

---

## 五、潜在问题与注意事项

### 后端

| # | 问题 | 严重程度 | 建议 |
|---|------|---------|------|
| 1 | `ListFilesByUser` 返回空切片时，Go 的 nil slice 会序列化为 JSON `null` 而非 `[]`，前端遍历时会报错 | 中 | 在 Handler 层初始化：`items := make([]dto.FileListItem, 0, len(files))`，保证序列化为 `[]` |
| 2 | MinIO 删除失败只记日志，长期运行会产生孤儿对象占用存储 | 低 | v1 可接受，后续补充定时清理任务扫描已软删除但 MinIO 对象仍存在的记录 |
| 3 | `DeleteFileByID` 事务内未校验 File 是否存在，单独调用时会静默成功 | 低 | 当前由 Service 层 `GetFileByID` 保证，无需额外处理；但如果未来其他地方调用 Repo 方法需注意 |

### 前端

| # | 问题 | 严重程度 | 建议 |
|---|------|---------|------|
| 1 | `src/query/` 目录已存在（包含 `canvas.ts`、`chat.ts`、`user.ts`、`index.ts`），直接新建 `file.ts` 即可 | 低 | 无需 `mkdir`，直接在已有目录下新建文件 |
| 2 | `queryOptions` 是 TanStack React Query **v5+** 的 API，当前项目已安装 `^5.90.20`，可直接使用 | 低 | 已确认版本满足要求，无需额外处理 |
| 3 | 图片缩略图直接加载原图，大文件时首屏加载慢、带宽浪费 | 中 | v1 先用 `loading="lazy"` + 卡片固定高度 + skeleton 缓解；v2 考虑上传时生成缩略图 |
| 4 | `getFileList` 失败时返回 `data: null`，组件中需做 null 安全处理 | 低 | 使用 `data?.files ?? []` 避免 runtime error |
| 5 | 下载功能依赖后端 `DownloadFile` handler 识别 `?download=true` 查询参数来设置 `Content-Disposition: attachment` | 中 | 实施前确认现有 handler 已支持该参数（当前代码中已有 inline/attachment 判断逻辑，大概率无需改动） |

---

## 六、验证方案

### 后端验证
```bash
# 1. 获取文件列表
curl -b cookies.txt "http://localhost:8080/api/file/list?page=1&limit=20"

# 2. 搜索文件
curl -b cookies.txt "http://localhost:8080/api/file/list?keyword=test"

# 3. 删除文件
curl -X DELETE -b cookies.txt "http://localhost:8080/api/file/123456"
```

### 前端验证
1. 访问 `/canvas/myresource`，确认卡片网格正常展示
2. 测试搜索防抖（输入后 300ms 才触发请求）
3. 测试分页切换（点击页码，数据更新）
4. 测试图片缩略图加载和非图片文件图标展示
5. 测试下载功能（浏览器触发文件下载）
6. 测试删除流程（弹出确认 Modal → 确认后列表刷新）
7. 切换三套主题（saas / dark / paper）验证样式适配

### 边界场景
- 无文件时展示空状态提示
- 搜索无结果时展示空状态
- 删除已绑定到 Canvas 节点的文件后，节点的 `file_id` 被设为 `-1`，ResourceNode 显示"File has been deleted"
- 已删除文件的 ResourceNode 作为 ChatNode 的父节点时，SendMessage / Retry 正确跳过该节点，不向 AI 发送无效上下文
- 非法 fileID 返回 404
- 非文件所有者尝试删除返回 403

---

## 七、后续优化方向（v2）

- **批量删除** — 当前只支持单个删除，资源多时操作效率低
- **文件排序** — 当前固定 `created_at DESC`，可考虑支持按文件名、文件大小排序
- **缩略图生成** — 上传时异步生成缩略图，避免列表页加载原图
- **MinIO 孤儿对象清理** — 定时任务扫描已软删除但 MinIO 对象仍存在的记录进行回收
