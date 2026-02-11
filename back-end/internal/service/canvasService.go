package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/luhao/contextGraph/internal/dto"
	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
	"golang.org/x/sync/errgroup"
)

type canvasRepo interface {
	CreateCanvas(ctx context.Context, userID int64) (model.Canvas, error)
	ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error)
	DeleteCanvas(ctx context.Context, canvasID int64, userID int64) error
	RenameCanvas(ctx context.Context, canvasID int64, userID int64, title string) error
	GetCanvasTitleAndVersionByCanvasID(ctx context.Context, canvasID int64, userID int64) (string, int64, error)
	GetCanvasNodesByCanvasID(ctx context.Context, canvasID int64) ([]model.Node, error)
	GetCanvasEdgesByCanvasID(ctx context.Context, canvasID int64) ([]model.NodeEdge, error)
	CheckCanvasOwnership(ctx context.Context, canvasID int64, userID int64) (bool, error)
	SyncCanvasInTransaction(ctx context.Context, canvasID int64, clientVersion int64, updatedNodes, createdNodes []model.Node, deletedNodeIDs []string, createdEdges []model.NodeEdge, deletedEdgeIDs []string) (time.Time, int64, error)
	FullSyncCanvasInTransaction(ctx context.Context, canvasID int64, clientVersion int64, nodes []model.Node, edges []model.NodeEdge) (time.Time, int64, error)
	GetCanvasVersion(ctx context.Context, canvasID int64, userID int64) (int64, error)
}

type canvasService struct {
	canvasRepo canvasRepo
}

func NewCanvasService(canvasRepo canvasRepo) *canvasService {
	return &canvasService{canvasRepo: canvasRepo}
}

func (s *canvasService) CreateCanvas(ctx context.Context, userID int64) (model.Canvas, error) {
	canvas, err := s.canvasRepo.CreateCanvas(ctx, userID)
	if err != nil {
		return model.Canvas{}, err
	}
	return canvas, err
}

func (s *canvasService) ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error) {
	canvasList, err := s.canvasRepo.ListCanvas(ctx, userID)
	if err != nil {
		return nil, err
	}
	return canvasList, nil
}

func (s *canvasService) DeleteCanvas(ctx context.Context, canvasID int64, userID int64) error {
	return s.canvasRepo.DeleteCanvas(ctx, canvasID, userID)
}

func (s *canvasService) RenameCanvas(ctx context.Context, canvasID int64, userID int64, title string) error {
	return s.canvasRepo.RenameCanvas(ctx, canvasID, userID, title)
}

func (s *canvasService) GetCanvasDetail(ctx context.Context, canvasID int64, userID int64) (string, int64, []model.Node, []model.NodeEdge, error) {
	var (
		title   string
		version int64
		nodes   []model.Node
		edges   []model.NodeEdge
	)

	g, ctx := errgroup.WithContext(ctx)

	// 1. 获取画布标题和版本号
	g.Go(func() error {
		var err error
		title, version, err = s.canvasRepo.GetCanvasTitleAndVersionByCanvasID(ctx, canvasID, userID)
		return err
	})

	// 2. 获取画布节点
	g.Go(func() error {
		var err error
		nodes, err = s.canvasRepo.GetCanvasNodesByCanvasID(ctx, canvasID)
		return err
	})

	// 3. 获取画布边
	g.Go(func() error {
		var err error
		edges, err = s.canvasRepo.GetCanvasEdgesByCanvasID(ctx, canvasID)
		return err
	})

	if err := g.Wait(); err != nil {
		return "", 0, nil, nil, err
	}

	return title, version, nodes, edges, nil
}

func (s *canvasService) SyncCanvas(ctx context.Context, canvasID int64, userID int64, delta dto.SyncCanvasRequest) (dto.SyncCanvasResponse, error) {
	// 1. 验证用户对画布的访问权限
	if owned, err := s.canvasRepo.CheckCanvasOwnership(ctx, canvasID, userID); err != nil {
		return dto.SyncCanvasResponse{}, err
	} else if !owned {
		return dto.SyncCanvasResponse{}, apperr.Unauthorized("User does not have access to this canvas")
	}

	// 2. 检查是否为空请求（没有任何变更）
	if s.isEmptyRequest(delta) {
		return dto.SyncCanvasResponse{
			UpdatedAt: time.Now(),
			Stats:     dto.SyncStats{},
		}, nil
	}

	// 3. 验证输入数据
	if err := s.validateSyncRequest(delta); err != nil {
		return dto.SyncCanvasResponse{}, err
	}

	// 4. 转换 DTO 为 Model（数据准备）
	updatedNodes, err := s.convertDTONodesToModel(delta.UpdatedNodes, canvasID)
	if err != nil {
		return dto.SyncCanvasResponse{}, err
	}

	createdNodes, err := s.convertDTONodesToModel(delta.CreatedNodes, canvasID)
	if err != nil {
		return dto.SyncCanvasResponse{}, err
	}

	createdEdges := s.convertDTOEdgesToModel(delta.CreatedEdges, canvasID)

	// 5. 在事务中执行所有同步操作（带乐观锁版本检查）
	updatedAt, newVersion, err := s.canvasRepo.SyncCanvasInTransaction(
		ctx,
		canvasID,
		delta.ClientVersion, // 传入客户端版本号
		updatedNodes,
		createdNodes,
		delta.DeletedNodesId,
		createdEdges,
		delta.DeletedEdgesId,
	)
	if err != nil {
		return dto.SyncCanvasResponse{}, err
	}

	// 6. 返回同步结果（包括新的版本号）
	return dto.SyncCanvasResponse{
		UpdatedAt: updatedAt,
		Version:   newVersion,
		Stats: dto.SyncStats{
			NodesUpdated: len(delta.UpdatedNodes),
			NodesCreated: len(delta.CreatedNodes),
			NodesDeleted: len(delta.DeletedNodesId),
			EdgesCreated: len(delta.CreatedEdges),
			EdgesDeleted: len(delta.DeletedEdgesId),
		},
	}, nil
}

func (s *canvasService) FullSyncCanvas(ctx context.Context, canvasID int64, userID int64, data dto.FullSyncCanvasRequest) (dto.FullSyncCanvasResponse, error) {
	// 1. 验证用户对画布的访问权限
	if owned, err := s.canvasRepo.CheckCanvasOwnership(ctx, canvasID, userID); err != nil {
		return dto.FullSyncCanvasResponse{}, err
	} else if !owned {
		return dto.FullSyncCanvasResponse{}, apperr.Unauthorized("User does not have access to this canvas")
	}

	// 2. 数据转换
	nodes, err := s.convertDTONodesToModel(data.Nodes, canvasID)
	if err != nil {
		return dto.FullSyncCanvasResponse{}, err
	}

	edges := s.convertDTOEdgesToModel(data.Edges, canvasID)

	// 3. 全量同步：删除所有旧数据，插入新数据
	updatedAt, newVersion, err := s.canvasRepo.FullSyncCanvasInTransaction(
		ctx,
		canvasID,
		data.ClientVersion,
		nodes,
		edges,
	)
	if err != nil {
		return dto.FullSyncCanvasResponse{}, err
	}

	return dto.FullSyncCanvasResponse{
		UpdatedAt: updatedAt,
		Version:   newVersion,
	}, nil
}

func (s *canvasService) GetCanvasVersion(ctx context.Context, canvasID int64, userID int64) (int64, error) {
	version, err := s.canvasRepo.GetCanvasVersion(ctx, canvasID, userID)
	if err != nil {
		return 0, err
	}

	return version, nil
}

// convertDTONodesToModel 将 DTO 节点转换为 Model 节点
func (s *canvasService) convertDTONodesToModel(dtoNodes []dto.Node, canvasID int64) ([]model.Node, error) {
	if len(dtoNodes) == 0 {
		return nil, nil
	}

	nodes := make([]model.Node, 0, len(dtoNodes))
	for _, node := range dtoNodes {
		resourceDataStr, err := json.Marshal(node.Data)
		if err != nil {
			return nil, apperr.InternalError("Failed to marshal node data")
		}
		nodes = append(nodes, model.Node{
			ID:           node.ID,
			CanvasID:     canvasID,
			NodeType:     node.Type,
			PosX:         node.Position.X,
			PosY:         node.Position.Y,
			ResourceData: resourceDataStr,
		})
	}
	return nodes, nil
}

// convertDTOEdgesToModel 将 DTO 边转换为 Model 边
func (s *canvasService) convertDTOEdgesToModel(dtoEdges []dto.Edge, canvasID int64) []model.NodeEdge {
	if len(dtoEdges) == 0 {
		return nil
	}

	edges := make([]model.NodeEdge, 0, len(dtoEdges))
	for _, edge := range dtoEdges {
		edges = append(edges, model.NodeEdge{
			ID:           edge.ID,
			CanvasID:     canvasID,
			SourceNodeID: edge.Source,
			TargetNodeID: edge.Target,
		})
	}
	return edges
}

// isEmptyRequest 检查是否为空请求（没有任何变更）
func (s *canvasService) isEmptyRequest(delta dto.SyncCanvasRequest) bool {
	return len(delta.UpdatedNodes) == 0 &&
		len(delta.CreatedNodes) == 0 &&
		len(delta.DeletedNodesId) == 0 &&
		len(delta.CreatedEdges) == 0 &&
		len(delta.DeletedEdgesId) == 0
}

// validateSyncRequest 验证同步请求的数据
func (s *canvasService) validateSyncRequest(delta dto.SyncCanvasRequest) error {
	// 验证节点数据
	for _, node := range delta.UpdatedNodes {
		if err := s.validateNode(node); err != nil {
			return err
		}
	}

	for _, node := range delta.CreatedNodes {
		if err := s.validateNode(node); err != nil {
			return err
		}
	}

	// 验证边数据
	for _, edge := range delta.CreatedEdges {
		if err := s.validateEdge(edge); err != nil {
			return err
		}
	}

	// 验证 ID 格式
	for _, nodeID := range delta.DeletedNodesId {
		if nodeID == "" {
			return apperr.BadRequest("Node ID cannot be empty")
		}
	}

	for _, edgeID := range delta.DeletedEdgesId {
		if edgeID == "" {
			return apperr.BadRequest("Edge ID cannot be empty")
		}
	}

	return nil
}

// validateNode 验证单个节点数据
func (s *canvasService) validateNode(node dto.Node) error {
	if node.ID == "" {
		return apperr.BadRequest("Node ID is required")
	}

	if node.Type == "" {
		return apperr.BadRequest("Node type is required")
	}

	// 验证节点类型是否合法
	if node.Type != "chatNode" && node.Type != "resourceNode" {
		return apperr.BadRequest("Invalid node type: " + node.Type)
	}

	return nil
}

// validateEdge 验证单个边数据
func (s *canvasService) validateEdge(edge dto.Edge) error {
	if edge.ID == "" {
		return apperr.BadRequest("Edge ID is required")
	}

	if edge.Source == "" {
		return apperr.BadRequest("Edge source is required")
	}

	if edge.Target == "" {
		return apperr.BadRequest("Edge target is required")
	}

	if edge.Type != "custom-edge" {
		return apperr.BadRequest("Invalid edge type: " + edge.Type)
	}

	return nil
}