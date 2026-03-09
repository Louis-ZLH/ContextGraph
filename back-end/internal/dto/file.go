package dto

type UploadFileResponse struct {
	FileID int64 `json:"file_id,string"`
}

type FileInfoResponse struct {
	FileID      int64  `json:"file_id,string"`
	Filename    string `json:"filename"`
	FileSize    int64  `json:"file_size"`
	ContentType string `json:"content_type"`
}

type BindFileToNodeRequest struct {
	FileID int64  `json:"file_id,string" binding:"required"`
	NodeID string `json:"node_id" binding:"required"`
}

// 文件列表中的单项
type FileListItem struct {
	FileID      int64  `json:"file_id,string"`
	Filename    string `json:"filename"`
	FileSize    int64  `json:"file_size"`
	ContentType string `json:"content_type"`
	CreatedAt   string `json:"created_at"`
}

// 存储用量响应
type StorageUsageResponse struct {
	Used  int64 `json:"used"`  // 已用（字节）
	Limit int64 `json:"limit"` // 上限（字节，200MB）
}

// 文件列表响应（带分页）
type FileListResponse struct {
	Files []FileListItem `json:"files"`
	Total int64          `json:"total"`
	Page  int            `json:"page"`
	Limit int            `json:"limit"`
}
