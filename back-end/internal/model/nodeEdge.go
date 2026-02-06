package model

import (
	"time"
)

type NodeEdge struct {
	CanvasID     int64     `gorm:"index;not null" json:"canvas_id,string"`          // 冗余字段，方便按画布查所有边
	ParentNodeID int64     `gorm:"primaryKey" json:"parent_node_id,string"`
	ChildNodeID  int64     `gorm:"primaryKey;index" json:"child_node_id,string"`    // 联合主键 + 单独索引查父节点
	CreatedAt    time.Time `json:"created_at"`
}

func (n *NodeEdge) TableName() string {
	return "node_edges"
}