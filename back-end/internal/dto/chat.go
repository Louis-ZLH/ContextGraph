package dto

import "time"

type ListCanvasConversationsResponse struct {
	Conversations []Conversation `json:"conversations"`
}

// 分表后下面信息不存在为nil的间隙，所以全部返回就行，无需指针。
type Conversation struct {
	ID string `json:"id"`
	CanvasID int64 `json:"canvas_id,string"`
	Title string `json:"title"`
	RootMessageID int64 `json:"root_message_id,string"`
	CurrentLeafID int64 `json:"current_leaf_id,string"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateConversationRequest struct {
	ConversationId string `json:"conversation_id" binding:"required"`
	CanvasId int64 `json:"canvas_id,string" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// "conversation": {
// 	"id": "abc123nanoid456789a",
// 	"canvas_id": "123456789012345",
// 	"title": "How to learn Go",
// 	"root_message_id": "987654321012345",
// 	"current_leaf_id": "987654321012345",
// 	"created_at": "2025-01-01T00:00:00Z",
// 	"updated_at": "2025-01-01T00:00:00Z"
// },
// "root_message": {
// 	"id": "987654321012345", /
// 	"conversation_id": "abc123nanoid456789a", /
// 	"role": "root", /
// 	"content": "", /
// 	"status": "completed", /
// 	"model": 0, /
// 	"parent_id": null, /
// 	"prompt_tokens": 0,
// 	"completion_tokens": 0,
// 	"created_at": "2025-01-01T00:00:00Z",
// 	"updated_at": "2025-01-01T00:00:00Z"
// }

type CreateConversationResponse struct {
	Conversation Conversation `json:"conversation"`
	RootMessage Message `json:"root_message"`
}

type Message struct {
	ID             int64     `json:"id,string"`
	ConversationID string    `json:"conversation_id"`
	ParentID       *int64    `json:"parent_id,string"`
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	Model          *int      `json:"model"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ParentDelta 携带前端尚未同步到后端的父节点变更，用于上下文组装时合并。
type ParentDelta struct {
	NewParentNodes       []ParentNode `json:"new_parent_nodes,omitempty"`
	DeletedParentNodeIDs []string     `json:"deleted_parent_node_ids,omitempty"`
}

// ParentNode 表示一个父节点的完整数据（与 canvas dto.Node 结构一致）。
type ParentNode struct {
	ID       string `json:"id" binding:"required"`
	Type     string `json:"type" binding:"required,oneof=chatNode resourceNode"`
	Position Pos    `json:"position"`
	FileID   *int64 `json:"file_id,string,omitempty"`
}

type SendMessageRequest struct {
	ConversationID string `json:"conversation_id" binding:"required"`
	ParentID       int64  `json:"parent_id,string" binding:"required"`
	Content        string `json:"content" binding:"required"`
	Model          int    `json:"model"`
	GenerateTitle  bool   `json:"generate_title"`
	ParentDelta
}

// TitleData title 事件的 data
type TitleData struct {
	Title string `json:"title"`
}

type RetryMessageRequest struct {
	ConversationID string `json:"conversation_id" binding:"required"`
	UserMsgID      int64  `json:"user_msg_id,string" binding:"required"`
	Model          int    `json:"model"`
	ParentDelta
}

type UpdateLeafRequest struct {
	LeafID int64 `json:"leaf_id,string" binding:"required"`
}

// SSE 事件：发送到前端的统一格式
type SSEEvent struct {
	Type string      `json:"type"` // "user_message" | "token" | "complete" | "error" | "summarizing" | "thinking" | "tool_call"
	Data interface{} `json:"data"`
}

// summarizing 事件的 data
type SummarizingData struct {
	Reason string `json:"reason"` // "node_summary" | "file_processing" | "message_summary"
}

// tool_call 事件的 data
type ToolCallData struct {
	Content string `json:"content"`
}

// token 事件的 data
type TokenData struct {
	Content   string `json:"content"`
	MessageID string `json:"message_id"`
}

// error 事件的 data
type ErrorData struct {
	Message   string `json:"message"`
	MessageID string `json:"message_id,omitempty"`
}

// user_message 事件的 data（完整消息 + 预生成的 assistant message ID）
type UserMessageEvent struct {
	FullMessage
	AssistantMsgID int64 `json:"assistant_msg_id,string"`
}

// retry_ack 事件的 data
type RetryAckEvent struct {
	AssistantMsgID int64 `json:"assistant_msg_id,string"`
}

// complete / user_message 事件的 data（完整消息，含 token 统计）
type FullMessage struct {
	ID               int64     `json:"id,string"`
	ConversationID   string    `json:"conversation_id"`
	ParentID         *int64    `json:"parent_id,string"`
	Role             string    `json:"role"`
	Content          string    `json:"content"`
	Model            *int      `json:"model"`
	Status           string    `json:"status"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}