package model

import (
	"time"

	"gorm.io/gorm"
)


type Node struct {
    ID        string         `gorm:"type:varchar(21);primaryKey"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
    CanvasID  int64          `gorm:"index" json:"canvas_id,string"`
    NodeType  string         `gorm:"type:varchar(20)" json:"node_type"`
    PosX      float64        `json:"pos_x"`
    PosY      float64        `json:"pos_y"`
    FileID    *int64         `gorm:"index" json:"file_id,omitempty"`
}

func (n *Node) TableName() string {
	return "nodes"
}