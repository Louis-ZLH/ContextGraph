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
