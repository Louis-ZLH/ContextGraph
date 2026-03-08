package model

import (
	"time"
)

type Message struct {
    BaseModel                                                              // int64 雪花 ID，软删除
    ConversationID   string     `gorm:"type:varchar(21);index;not null" json:"conversation_id"`
    ParentID         *int64     `gorm:"index" json:"parent_id,omitempty,string"`  // root 消息为 null
    Role             string     `gorm:"type:varchar(20)" json:"role"`              // 'user' | 'assistant' | 'root'
    Content          string     `gorm:"type:text" json:"content"`
    Model            *int       `json:"model"`                    // model index 0-3
    Status           string     `gorm:"type:varchar(20)" json:"status"`            // 'completed' | 'error' | 'aborted'
    PromptTokens     int        `json:"prompt_tokens"`
    CompletionTokens int        `json:"completion_tokens"`
    ExpiredAt        *time.Time `json:"expired_at"`
    Summary          *string    `gorm:"type:text" json:"summary,omitempty"`
}

func (m *Message) TableName() string {
	return "messages"
}