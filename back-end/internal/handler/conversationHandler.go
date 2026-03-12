package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/dto"
	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
)
type conversationService interface {
	CreateConversation(ctx context.Context, userID int64, conversationID string, canvasID int64, content string) (model.Conversation, model.Message, error)
	GetConversationHistory(ctx context.Context, userID int64, conversationID string) ([]model.Message, error)
	SendMessage(ctx context.Context, userID int64, req dto.SendMessageRequest, eventCh chan<- dto.SSEEvent)
	RetryMessage(ctx context.Context, userID int64, req dto.RetryMessageRequest, eventCh chan<- dto.SSEEvent)
	UpdateCurrentLeaf(ctx context.Context, userID int64, conversationID string, leafID int64) error
}

type ConversationHandler struct {
	conversationService conversationService
}

func NewConversationHandler(conversationService conversationService) *ConversationHandler {
	return &ConversationHandler{conversationService: conversationService}
}

const maxContentLength = 15000 // 单条消息最大 15,000 字符，与前端一致

func (h *ConversationHandler) CreateConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	var req dto.CreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request parameters"))
		return
	}

	if len([]rune(req.Content)) > maxContentLength {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Message content too long"))
		return
	}

	conversation, rootMessage, err:= h.conversationService.CreateConversation(c.Request.Context(), userID.(int64), req.ConversationId, req.CanvasId, req.Content)
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	dto_Conversation := dto.Conversation{
		ID: conversation.ID,
		CanvasID: conversation.CanvasID,
		Title: conversation.Title,
		RootMessageID: conversation.RootMessageID,
		CurrentLeafID: conversation.CurrentLeafID,
		CreatedAt: conversation.CreatedAt,
		UpdatedAt: conversation.UpdatedAt,
	}
	dto_RootMessage := dto.Message{
		ID: rootMessage.ID,
		ConversationID: rootMessage.ConversationID,
		ParentID: rootMessage.ParentID,
		Role: rootMessage.Role,
		Content: rootMessage.Content,
		Model: rootMessage.Model,
		Status: rootMessage.Status,
		CreatedAt: rootMessage.CreatedAt,
		UpdatedAt: rootMessage.UpdatedAt,
	}

	c.JSON(http.StatusOK, dto.Success(dto.CreateConversationResponse{
		Conversation: dto_Conversation,
		RootMessage: dto_RootMessage,
	}))
}

func (h *ConversationHandler) GetConversationHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	conversationID := c.Param("conversationId")
	if conversationID == "" {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Conversation ID is required"))
		return
	}

	messages, err := h.conversationService.GetConversationHistory(c.Request.Context(), userID.(int64), conversationID)
	if err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	// 会话不存在时返回 data: null
	if messages == nil {
		c.JSON(http.StatusOK, dto.Success(nil))
		return
	}

	dto_Messages := make([]dto.Message, len(messages))
	for i, message := range messages {
		dto_Messages[i] = dto.Message{
			ID:             message.ID,
			ConversationID: message.ConversationID,
			ParentID:       message.ParentID,
			Role:           message.Role,
			Content:        message.Content,
			Model:          message.Model,
			Status:         message.Status,
			FileURL:        message.FileURL,
			FileName:       message.FileName,
			CreatedAt:      message.CreatedAt,
			UpdatedAt:      message.UpdatedAt,
		}
	}

	// data 直接为消息数组，不再包一层
	c.JSON(http.StatusOK, dto.Success(dto_Messages))
}

func (h *ConversationHandler) SendMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	var req dto.SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request parameters"))
		return
	}

	if len([]rune(req.Content)) > maxContentLength {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Message content too long"))
		return
	}

	// 设置 SSE headers
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Flush()

	ctx := c.Request.Context()
	eventCh := make(chan dto.SSEEvent, 16)

	go h.conversationService.SendMessage(ctx, userID.(int64), req, eventCh)

	for event := range eventCh {
		data, _ := json.Marshal(event)
		fmt.Fprintf(c.Writer, "data: %s\n\n", data)
		c.Writer.Flush()
	}

	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	c.Writer.Flush()
}

func (h *ConversationHandler) UpdateCurrentLeaf(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	conversationID := c.Param("conversationId")
	if conversationID == "" {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Conversation ID is required"))
		return
	}

	var req dto.UpdateLeafRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request parameters"))
		return
	}

	if err := h.conversationService.UpdateCurrentLeaf(c.Request.Context(), userID.(int64), conversationID, req.LeafID); err != nil {
		if appErr, ok := apperr.GetAppError(err); ok {
			c.JSON(appErr.Code, dto.Error(appErr.BizCode, appErr.Message))
			return
		}
		c.JSON(500, dto.Error(apperr.BizUnknown, "Internal Server Error"))
		return
	}

	c.JSON(http.StatusOK, dto.Success(nil))
}

func (h *ConversationHandler) RetryMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
		return
	}

	var req dto.RetryMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Error(apperr.BizInvalidParams, "Invalid request parameters"))
		return
	}
	// 设置 SSE headers
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Flush()

	ctx := c.Request.Context()
	eventCh := make(chan dto.SSEEvent, 16)

	go h.conversationService.RetryMessage(ctx, userID.(int64), req, eventCh)

	for event := range eventCh {
		data, _ := json.Marshal(event)
		fmt.Fprintf(c.Writer, "data: %s\n\n", data)
		c.Writer.Flush()
	}

	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	c.Writer.Flush()
}