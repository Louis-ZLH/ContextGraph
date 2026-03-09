# 文件存储配额功能

## 背景

每个用户（free 计划）拥有 200MB 的文件上传总量限制。需要：
1. 在 MyResource 页面展示存储用量进度条，显示已用/剩余容量
2. 后端在每次上传时校验用户是否超出 200MB 限制，超出则拒绝上传

## 设计决策：SUM 查询 vs User 表加字段

**采用方案：直接查询 `files` 表的 `SUM(file_size)`**，不在 `users` 表新增字段。

理由：
- `files` 表已有 `file_size` 和 `user_id`（带索引），聚合查询性能足够
- 数据永远准确，不存在字段与实际存储不一致的漂移问题
- 无需在上传时 +size、删除时 -size，逻辑更简单
- 无需处理历史数据迁移，SUM 自然包含所有已有文件

已知限制：
- **并发上传 race condition**：若用户同时发起多个上传请求，可能同时通过配额检查导致总用量略超 200MB（最多超出一个文件大小，即 5MB）。对 free 用户场景概率极低、后果有限，当前阶段可接受不处理。
- **配额常量硬编码**：`maxStoragePerUser` 当前为硬编码常量。若未来引入付费计划需按用户等级查询配额，届时需将常量改为从用户信息中动态获取。

---

## 后端改动

### 1. FileRepo — 新增 `GetUserStorageUsed`

**文件：** `internal/repo/fileRepo.go`

新增方法，查询用户已用存储（字节）：

```go
func (r *FileRepo) GetUserStorageUsed(ctx context.Context, userID int64) (int64, error) {
    var total int64
    err := r.db.WithContext(ctx).Model(&model.File{}).
        Where("user_id = ?", userID).
        Select("COALESCE(SUM(file_size), 0)").
        Scan(&total).Error
    return total, err
}
```

### 2. FileService — 上传时校验配额

**文件：** `internal/service/fileService.go`

- 新增常量：`maxStoragePerUser = 200 << 20`（200MB）
- 在 `FileRepo` 接口中新增：`GetUserStorageUsed(ctx, userID) (int64, error)`
- 在 `UploadFile` 方法中，基础校验之后、上传 MinIO 之前，检查配额：
  ```go
  used, err := s.repo.GetUserStorageUsed(ctx, userID)
  // uploadSize 来自 fileHeader.Size
  uploadSize := fileHeader.Size
  if used + uploadSize > maxStoragePerUser {
      return 0, apperr.BadRequest("存储空间不足，免费用户最多上传 200MB 文件")
  }
  ```
- 新增方法 `GetStorageUsage(ctx, userID) → (used int64, limit int64, error)`

### 3. DTO — 新增存储用量响应

**文件：** `internal/dto/file.go`

```go
type StorageUsageResponse struct {
    Used  int64 `json:"used"`   // 已用（字节）
    Limit int64 `json:"limit"`  // 上限（字节，200MB）
}
```

### 4. FileHandler — 新增 GetStorageUsage 接口

**文件：** `internal/handler/fileHandler.go`

- `FileService` 接口新增 `GetStorageUsage`
- 新增 handler 方法，返回 `StorageUsageResponse`

### 5. Router — 新增路由

**文件：** `internal/api/file.go`

```go
fileApi.GET("/storage", a.H.FileHandler.GetStorageUsage)
```

---

## 前端改动

### 6. Service — 新增 getStorageUsage API 调用

**文件：** `front-end/src/service/file.ts`

```ts
export async function getStorageUsage(): Promise<{
  success: boolean;
  message: string;
  data: StorageUsageResponse | null;
}> { ... }
```

### 7. Types — 新增 StorageUsageResponse 类型

**文件：** `front-end/src/service/type.ts`

```ts
export interface StorageUsageResponse {
  used: number;
  limit: number;
}
```

### 8. Query — 新增 storage query options

**文件：** `front-end/src/query/file.ts`

新增 `storageUsageQueryOptions`，设置合理的 `staleTime`。

### 9. MyResource — 新增存储用量进度条

**文件：** `front-end/src/view/canvas/MyResource.tsx`

在页面 Header 和文件网格之间添加存储用量条：
- 通过 React Query 查询存储用量（`staleTime` 设为 5 分钟，因用量仅在上传/删除时变化，且这两个操作都会 invalidate 缓存）
- 展示进度条 + "XX MB / 200 MB used" 文字
- 使用已有 Tailwind CSS 主题变量（`--accent`、`--bg-app` 等）
- 文件删除成功后同时 invalidate `["file", "storage"]` 查询
- UploadButton 上传成功后同时 invalidate `["file", "storage"]` 查询

**进度条阈值样式：**
- 用量 < 80%：默认主题色（`--accent`）
- 用量 >= 80%：警告色（橙色 `--warning` 或 `#f59e0b`）
- 用量 >= 95%：危险色（红色 `--destructive` 或 `#ef4444`）

**配额超限时的上传错误提示：**
- 后端返回配额不足错误时，前端通过现有 toast 机制展示错误消息："存储空间不足，免费用户最多上传 200MB 文件"
- 无需禁用上传按钮（用户可能先删除文件再上传）

---

## 实现注意事项

### 1. 路由注册顺序

现有路由中有 `GET /:id`（DownloadFile）参数路由。新增的 `GET /storage` 必须注册在 `/:id` **之前**，否则 `/storage` 可能被 Gin 当作 `:id=storage` 匹配到 DownloadFile。Gin 静态路由优先于参数路由，但显式放在前面更安全。

### 2. CSS 主题变量补充

当前主题系统中不存在 `--warning` 和 `--destructive` 变量。实现时需在三套主题（saas / dark / paper）中补充这两个变量定义，确保进度条的警告色和危险色能跟随主题切换。若不补充，则只能使用硬编码色值（`#f59e0b` / `#ef4444`），不随主题变化。

### 3. 复用已有 `formatFileSize`

`front-end/src/service/file.ts` 中已有 `formatFileSize(bytes)` 工具函数，进度条的 "XX MB / 200 MB used" 显示应直接复用，无需重复实现。

---

## 验证方式

1. 后端：上传文件直到接近 200MB，验证超限后上传被拒绝并返回合适的错误信息
2. 前端：上传/删除文件后进度条数值实时更新
3. 边界情况：上传一个会导致总量超过 200MB 的文件，应被拒绝
