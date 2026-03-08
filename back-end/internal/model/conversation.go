package model

import (
	"time"
	"gorm.io/gorm"
)

type Conversation struct {
    ID            string         `gorm:"type:varchar(21);primaryKey"` // = node ID，共用但无 FK
    CanvasID      int64          `gorm:"index;not null" json:"canvas_id,string"`
    Title         string         `gorm:"type:varchar(255)" json:"title"`
    RootMessageID int64         `json:"root_message_id,omitempty,string"` // 创建对话时，会创建root消息确保这里不为null
    CurrentLeafID int64         `json:"current_leaf_id,omitempty,string"` // 同上
    CreatedAt     time.Time      `json:"created_at"`
    UpdatedAt     time.Time      `json:"updated_at"`
    DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}