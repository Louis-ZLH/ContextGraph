package model

import (
	"time"
)

type NodeEdge struct {
    ID           string    `gorm:"type:varchar(21);primaryKey" json:"id"`
    CanvasID     int64     `gorm:"uniqueIndex:idx_canvas_source_target;index;not null" json:"canvas_id,string"`
    SourceNodeID string    `gorm:"type:varchar(21);uniqueIndex:idx_canvas_source_target" json:"source_node_id,string"`
    TargetNodeID string    `gorm:"type:varchar(21);uniqueIndex:idx_canvas_source_target" json:"target_node_id,string"`
    CreatedAt    time.Time `json:"created_at"`
}

func (n *NodeEdge) TableName() string {
	return "node_edges"
}

