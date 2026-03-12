package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/dto"
	apperr "github.com/luhao/contextGraph/pkg/errors"
)

type InternalFileService interface {
	RegisterAIGeneratedFile(
		ctx context.Context,
		userID int64,
		canvasID int64,
		chatNodeID string,
		messageID string,
		minioPath string,
		filename string,
		fileSize int64,
		contentType string,
	) (fileID int64, nodeID string, edgeID string, position dto.Pos, fileURL string, err error)
}

type InternalConversationService interface {
	UpdateMessageTokenUsage(ctx context.Context, messageID int64, promptTokens, completionTokens int) error
}

type InternalHandler struct {
	fileService         InternalFileService
	conversationService InternalConversationService
}

func NewInternalHandler(fileService InternalFileService, conversationService InternalConversationService) *InternalHandler {
	return &InternalHandler{fileService: fileService, conversationService: conversationService}
}

// RegisterAIGeneratedFile POST /api/internal/ai/file
func (h *InternalHandler) RegisterAIGeneratedFile(c *gin.Context) {
	var req dto.RegisterAIFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid parameters"))
		return
	}

	fileID, nodeID, edgeID, position, fileURL, err := h.fileService.RegisterAIGeneratedFile(
		c.Request.Context(),
		req.UserID,
		req.CanvasID,
		req.ChatNodeID,
		req.MessageID,
		req.MinioPath,
		req.Filename,
		req.FileSize,
		req.ContentType,
	)
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(http.StatusInternalServerError, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(dto.RegisterAIFileResponse{
		FileID:   fileID,
		NodeID:   nodeID,
		EdgeID:   edgeID,
		Position: position,
		FileURL:  fileURL,
	}))
}

// UpdateMessageUsage PATCH /api/internal/messages/:message_id/usage
func (h *InternalHandler) UpdateMessageUsage(c *gin.Context) {
	messageID, err := strconv.ParseInt(c.Param("message_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid message_id"))
		return
	}

	var req dto.UpdateMessageUsageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid parameters"))
		return
	}

	if err := h.conversationService.UpdateMessageTokenUsage(c.Request.Context(), messageID, req.PromptTokens, req.CompletionTokens); err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(http.StatusInternalServerError, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.SuccessMsg("ok"))
}
