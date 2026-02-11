package model

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)


type Node struct {
	ID        string		 `gorm:"type:varchar(21);primaryKey" json:"id"` // 前端nonode生成，后端不生成ID
	CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	CanvasID    int64          `gorm:"index" json:"canvas_id,string"`
	NodeType    string         `gorm:"type:varchar(20)" json:"node_type"` // 'chat', 'resource'
	// ResourceURL string         `gorm:"type:varchar(2048)" json:"resource_url,omitempty"`
	PosX        float64        `json:"pos_x"`
	PosY        float64        `json:"pos_y"`
	ResourceData datatypes.JSON `gorm:"type:json" json:"resource_data,omitempty"`
}

func (n *Node) TableName() string {
	return "nodes"
}

// ResourceData字段说明：放在DTO里面的NodeData结构体里
//type ResourceData struct {
// 	ResourceUrl  *string `json:"resourceUrl,omitempty"`
// 	UploadStatus *string `json:"uploadStatus,omitempty"` // "uploading" | "success" | "error"
// 	FileName     *string `json:"fileName,omitempty"`
// 	FileType     *string `json:"fileType,omitempty"`
// 	MimeType     *string `json:"mimeType,omitempty"`
// 	FileSize     *int64  `json:"fileSize,omitempty"`
// 	Extra map[string]interface{} `json:"extra,omitempty"`
// }