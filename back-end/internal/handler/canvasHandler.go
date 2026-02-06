package handler

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/dto"
	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
)


type CanvasService interface {
	CreateCanvas(ctx context.Context, userID int64) (int64, error)
	ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error)
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
	
	canvasID, err := h.canvasService.CreateCanvas(c.Request.Context(), userID.(int64))
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
		CanvasID: canvasID,
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