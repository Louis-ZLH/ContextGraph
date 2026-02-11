package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/dto"
	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
)


type CanvasService interface {
	CreateCanvas(ctx context.Context, userID int64) (model.Canvas, error)
	ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error)
	DeleteCanvas(ctx context.Context, canvasID int64, userID int64) error
	RenameCanvas(ctx context.Context, canvasID int64, userID int64, title string) error
	GetCanvasDetail(ctx context.Context, canvasID int64, userID int64) (string, int64, []model.Node, []model.NodeEdge, error)
	SyncCanvas(ctx context.Context, canvasID int64, userID int64, delta dto.SyncCanvasRequest) (dto.SyncCanvasResponse, error)
	FullSyncCanvas(ctx context.Context, canvasID int64, userID int64, delta dto.FullSyncCanvasRequest) (dto.FullSyncCanvasResponse, error)
	GetCanvasVersion(ctx context.Context, canvasID int64, userID int64) (int64, error)
}

type CanvasHandler struct {
	canvasService CanvasService
}

func NewCanvasHandler(canvasService CanvasService) *CanvasHandler {
	return &CanvasHandler{canvasService: canvasService}
}

func (h *CanvasHandler) CreateCanvas(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}
	
	canvas, err := h.canvasService.CreateCanvas(c.Request.Context(), userID.(int64))
	if err != nil {
		// 区分错误类型
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(dto.CreateCanvasResponse{
		ID:        canvas.ID,
		Title:     canvas.Title,
		UpdatedAt: canvas.UpdatedAt,
	}))
}

func (h *CanvasHandler) ListCanvas(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	canvasList, err := h.canvasService.ListCanvas(c.Request.Context(), userID.(int64))
	if err != nil {
		// 区分错误类型
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	// 转换为 DTO 格式
	dtoCanvasList := make([]dto.Canvas, len(canvasList))
	for i, canvas := range canvasList {
		dtoCanvasList[i] = canvas.ToDTO()
	}

	c.JSON(http.StatusOK, dto.Success(dto.ListCanvasResponse{
		CanvasList: dtoCanvasList,
	}))
}

func (h *CanvasHandler) DeleteCanvas(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	canvasIDStr := c.Param("id")
	canvasID, err := strconv.ParseInt(canvasIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid canvas ID"))
		return
	}

	err = h.canvasService.DeleteCanvas(c.Request.Context(), canvasID, userID.(int64))
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(nil))
}

func (h *CanvasHandler) RenameCanvas(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	canvasIDStr := c.Param("id")
	canvasID, err := strconv.ParseInt(canvasIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid canvas ID"))
		return
	}

	var req dto.RenameCanvasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request body"))
		return
	}

	err = h.canvasService.RenameCanvas(c.Request.Context(), canvasID, userID.(int64), req.Title)
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(nil))
}

func (h *CanvasHandler) GetCanvasDetail(c *gin.Context){
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	canvasIDStr := c.Param("id")
	canvasID, err := strconv.ParseInt(canvasIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid canvas ID"))
		return
	}

	title, version, nodes, edges, err := h.canvasService.GetCanvasDetail(c.Request.Context(), canvasID, userID.(int64))
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	var dtoNodes = make([]dto.Node, 0, len(nodes))
	for _, node := range nodes {
		var nodeData dto.NodeData
		if err := json.Unmarshal(node.ResourceData, &nodeData); err != nil {
			c.JSON(http.StatusInternalServerError, dto.Error(apperr.BizUnknown, "Internal Server Error"))
			return
		}
		dtoNodes = append(dtoNodes, dto.Node{
			ID: node.ID,
			Type: node.NodeType,
			Position: dto.Pos{
				X: node.PosX,
				Y: node.PosY,
			},
			Data: nodeData,
		})
	}
	var dtoEdges = make([]dto.Edge, 0, len(edges))
	for _, edge := range edges {
		dtoEdges = append(dtoEdges, dto.Edge{
			ID: edge.ID,
			Source: edge.SourceNodeID,
			Target: edge.TargetNodeID,
			Type: "custom-edge",
		})
	}
	c.JSON(http.StatusOK, dto.Success(dto.GetCanvasDetailResponse{
		CanvasID: canvasID,
		Title: title,
		Version: version,
		Nodes: dtoNodes,
		Edges: dtoEdges,
	}))
}

func (h *CanvasHandler) SyncCanvas(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	canvasIDStr := c.Param("id")
	canvasID, err := strconv.ParseInt(canvasIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid canvas ID"))
		return
	}

	var req dto.SyncCanvasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request body"))
		return
	}

	response, err := h.canvasService.SyncCanvas(c.Request.Context(), canvasID, userID.(int64), req)
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(response))
}

func (h *CanvasHandler) FullSyncCanvas(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	canvasIDStr := c.Param("id")
	canvasID, err := strconv.ParseInt(canvasIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid canvas ID"))
		return
	}

	var req dto.FullSyncCanvasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request body"))
		return
	}

	response, err := h.canvasService.FullSyncCanvas(c.Request.Context(), canvasID, userID.(int64), req)
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(response))
}

func (h *CanvasHandler) GetCanvasVersion(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
        return
    }

    canvasIDStr := c.Param("id")
    canvasID, err := strconv.ParseInt(canvasIDStr, 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid canvas ID"))
        return
    }

    version, err := h.canvasService.GetCanvasVersion(c.Request.Context(), canvasID, userID.(int64))
    if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

    c.JSON(http.StatusOK, dto.Success(dto.GetCanvasVersionResponse{
		Version: version,
	}))
}