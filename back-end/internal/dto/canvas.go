package dto

import "time"

type CreateCanvasResponse struct {
	ID int64 `json:"id,string"`
	Title string `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ListCanvasResponse struct {
	CanvasList []Canvas `json:"canvas_list"`
}

type Canvas struct {
	ID int64 `json:"id,string"`
	Title string `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}

type RenameCanvasRequest struct {
	Title string `json:"title" binding:"required,min=1,max=100"`
}

type CreateNodeRequest struct {
	CanvasID int64 `json:"canvas_id" binding:"required"`
	Type string `json:"type" binding:"required,oneof=chat resource"`
	PositionX float64 `json:"position_x" binding:"required"`
	PositionY float64 `json:"position_y" binding:"required"`
}

type CreateEdgeRequest struct {
	CanvasID int64 `json:"canvas_id" binding:"required"`
	SourceNodeID int64 `json:"source_node_id" binding:"required"`
	TargetNodeID int64 `json:"target_node_id" binding:"required"`
}


type GetCanvasDetailResponse struct {
	CanvasID int64 `json:"canvas_id,string"`
	Title string `json:"title"`
	Version int64 `json:"version"` // 画布版本号（乐观锁）
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type Node struct {
	ID string `json:"id" binding:"required"` // 前端nonode生成
	Type string `json:"type" binding:"required,oneof=chatNode resourceNode"`
	Position Pos `json:"position" binding:"required"`
	Data NodeData `json:"data"`
}

type Pos struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type NodeData struct {
	ResourceUrl  *string `json:"resourceUrl,omitempty"`
	UploadStatus *string `json:"uploadStatus,omitempty"` // "uploading" | "success" | "error"
	FileName     *string `json:"fileName,omitempty"`
	FileType     *string `json:"fileType,omitempty"`
	MimeType     *string `json:"mimeType,omitempty"`
	FileSize     *int64  `json:"fileSize,omitempty"`
	Extra map[string]interface{} `json:"extra,omitempty"`
}

type Edge struct {
	ID     string `json:"id" binding:"required"` // 前端nonode生成
	Source string `json:"source" binding:"required"`
	Target string `json:"target" binding:"required"`
	Type string   `json:"type" binding:"required,oneof=custom-edge"` 
}

type SyncCanvasRequest struct {
    UpdatedNodes   []Node   `json:"updatedNodes" binding:"required"`
    CreatedNodes   []Node   `json:"createdNodes" binding:"required"`
    DeletedNodesId []string `json:"deletedNodesId" binding:"required"`
    CreatedEdges   []Edge   `json:"createdEdges" binding:"required"`
    DeletedEdgesId []string `json:"deletedEdgesId" binding:"required"`
    ClientVersion  int64    `json:"clientVersion" binding:"required"` // 客户端版本号（乐观锁）
}

type SyncCanvasResponse struct {
	UpdatedAt time.Time `json:"updated_at"`
	Version   int64     `json:"version"` // 新的版本号
	Stats     SyncStats `json:"stats"`
}

type SyncStats struct {
	NodesUpdated int `json:"nodes_updated"`
	NodesCreated int `json:"nodes_created"`
	NodesDeleted int `json:"nodes_deleted"`
	EdgesCreated int `json:"edges_created"`
	EdgesDeleted int `json:"edges_deleted"`
}

type FullSyncCanvasRequest struct {
	CanvasID int64 `json:"canvas_id,string" binding:"required"`
	Nodes []Node `json:"nodes" binding:"required"`
	Edges []Edge `json:"edges" binding:"required"`
	ClientVersion  int64    `json:"clientVersion" binding:"required"` // 客户端版本号（乐观锁）
}

type FullSyncCanvasResponse struct {
	Version int64 `json:"version"` // 新的版本号
	UpdatedAt time.Time `json:"updated_at"`
}

type GetCanvasVersionResponse struct {
	Version int64 `json:"version"`
}