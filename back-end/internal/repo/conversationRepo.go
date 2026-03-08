package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/luhao/contextGraph/internal/model"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// ---- Redis key patterns & TTLs ----
const (
	// Message-level summary 生成锁，防止同一会话并发生成 summary
	keyMsgSummaryLock = "conversation:message_level:gen_summary:%s"
	msgSummaryLockTTL = 90 * time.Second

	// Node-level summary 缓存
	keyNodeSummaryCache = "summary:node_level:%s:%d"
	nodeSummaryCacheTTL = 1 * time.Hour

	// Node-level summary 生成锁
	keyNodeSummaryLock    = "node_summary:gen_lock:%s:%d"
	nodeSummaryLockTTL = 90 * time.Second

	// Title 生成锁，防止同一会话重复调用 AI 生成标题
	keyGenTitleLock = "conversation:%s:gen_title"
	genTitleLockTTL = 60 * time.Second
)

type ConversationRepo struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewConversationRepo(db *gorm.DB, rdb *redis.Client) *ConversationRepo {
	return &ConversationRepo{db: db, rdb: rdb}
}

func (r *ConversationRepo) CreateConversation(ctx context.Context, conversationID string, canvasID int64, title string) (model.Conversation, model.Message, error) {
	tx := r.db.WithContext(ctx).Begin()
	defer tx.Rollback()

	// 1. 创建根消息
	rootMessage := model.Message{
		ConversationID: conversationID,
		ParentID: nil,
		Role: "root",
		Content: "",
		Model: nil,
		Status: "completed",
		PromptTokens: 0,
		CompletionTokens: 0,
	}
	if err := tx.Create(&rootMessage).Error; err != nil {
		return model.Conversation{}, model.Message{}, err
	}

	// 2. 创建会话
	conversation := model.Conversation{
		ID: conversationID,
		CanvasID: canvasID,
		Title: title,
		RootMessageID: rootMessage.ID,
		CurrentLeafID: rootMessage.ID,
	}
	if err := tx.Create(&conversation).Error; err != nil {
		return model.Conversation{}, model.Message{}, err
	}

	if err := tx.Commit().Error; err != nil {
		return model.Conversation{}, model.Message{}, err
	}

	return conversation, rootMessage, nil
}

func (r *ConversationRepo) GetConversationByID(ctx context.Context, conversationID string) (model.Conversation, error) {
	var conversation model.Conversation
	if err := r.db.WithContext(ctx).Where("id = ?", conversationID).First(&conversation).Error; err != nil {
		return model.Conversation{}, err
	}
	return conversation, nil
}

func (r *ConversationRepo) GetMessagesByConversationID(ctx context.Context, conversationID string) ([]model.Message, error) {
	var messages []model.Message
	if err := r.db.WithContext(ctx).Where("conversation_id = ?", conversationID).Order("created_at ASC").Find(&messages).Error; err != nil {
		return nil, err
	}
	return messages, nil
}

func (r *ConversationRepo) CreateMessage(ctx context.Context, msg *model.Message) error {
	return r.db.WithContext(ctx).Create(msg).Error
}

func (r *ConversationRepo) GetMessageByID(ctx context.Context, id int64) (model.Message, error) {
	var msg model.Message
	if err := r.db.WithContext(ctx).First(&msg, id).Error; err != nil {
		return model.Message{}, err
	}
	return msg, nil
}

func (r *ConversationRepo) UpdateCurrentLeafID(ctx context.Context, conversationID string, leafID int64) error {
	return r.db.WithContext(ctx).Model(&model.Conversation{}).
		Where("id = ?", conversationID).
		Update("current_leaf_id", leafID).Error
}

// AcquireGenTitleLock 尝试获取 title 生成锁（SetNX），成功返回 true。
func (r *ConversationRepo) AcquireGenTitleLock(ctx context.Context, conversationID string) (bool, error) {
	key := fmt.Sprintf(keyGenTitleLock, conversationID)
	return r.rdb.SetNX(ctx, key, 1, genTitleLockTTL).Result()
}

func (r *ConversationRepo) UpdateTitle(ctx context.Context, conversationID string, title string) error {
	return r.db.WithContext(ctx).Model(&model.Conversation{}).
		Where("id = ? AND title = ''", conversationID).
		Update("title", title).Error
}

// ========== Message-level summary 锁 ==========

// AcquireMsgSummaryLock 尝试获取 message-level summary 生成锁（SetNX）
func (r *ConversationRepo) AcquireMsgSummaryLock(ctx context.Context, conversationID string) (bool, error) {
	key := fmt.Sprintf(keyMsgSummaryLock, conversationID)
	return r.rdb.SetNX(ctx, key, 1, msgSummaryLockTTL).Result()
}

// ReleaseMsgSummaryLock 释放 message-level summary 生成锁
func (r *ConversationRepo) ReleaseMsgSummaryLock(ctx context.Context, conversationID string) error {
	key := fmt.Sprintf(keyMsgSummaryLock, conversationID)
	return r.rdb.Del(ctx, key).Err()
}

// IsMsgSummaryLocked 检查 message-level summary 生成锁是否存在
func (r *ConversationRepo) IsMsgSummaryLocked(ctx context.Context, conversationID string) (bool, error) {
	key := fmt.Sprintf(keyMsgSummaryLock, conversationID)
	n, err := r.rdb.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// UpdateMessageSummary 更新指定 message 的 summary 字段
func (r *ConversationRepo) UpdateMessageSummary(ctx context.Context, messageID int64, summary string) error {
	return r.db.WithContext(ctx).Model(&model.Message{}).
		Where("id = ?", messageID).
		Update("summary", summary).Error
}

// ========== Node-level summary 缓存 ==========

// GetNodeSummaryCache 从 Redis 获取 node-level summary 缓存
func (r *ConversationRepo) GetNodeSummaryCache(ctx context.Context, conversationID string, leafID int64) (string, error) {
	key := fmt.Sprintf(keyNodeSummaryCache, conversationID, leafID)
	return r.rdb.Get(ctx, key).Result()
}

// SetNodeSummaryCache 将 node-level summary 写入 Redis 缓存
func (r *ConversationRepo) SetNodeSummaryCache(ctx context.Context, conversationID string, leafID int64, summary string) error {
	key := fmt.Sprintf(keyNodeSummaryCache, conversationID, leafID)
	return r.rdb.Set(ctx, key, summary, nodeSummaryCacheTTL).Err()
}

// DeleteNodeSummaryCache 删除 node-level summary 缓存
func (r *ConversationRepo) DeleteNodeSummaryCache(ctx context.Context, conversationID string, leafID int64) error {
	key := fmt.Sprintf(keyNodeSummaryCache, conversationID, leafID)
	return r.rdb.Del(ctx, key).Err()
}

// ========== Node-level summary 生成锁 ==========

// AcquireNodeSummaryLock 尝试获取 node-level summary 生成锁（SetNX）
func (r *ConversationRepo) AcquireNodeSummaryLock(ctx context.Context, conversationID string, leafID int64) (bool, error) {
	key := fmt.Sprintf(keyNodeSummaryLock, conversationID, leafID)
	return r.rdb.SetNX(ctx, key, 1, nodeSummaryLockTTL).Result()
}

// ReleaseNodeSummaryLock 释放 node-level summary 生成锁
func (r *ConversationRepo) ReleaseNodeSummaryLock(ctx context.Context, conversationID string, leafID int64) error {
	key := fmt.Sprintf(keyNodeSummaryLock, conversationID, leafID)
	return r.rdb.Del(ctx, key).Err()
}

// IsNodeSummaryLocked 检查 node-level summary 生成锁是否存在
func (r *ConversationRepo) IsNodeSummaryLocked(ctx context.Context, conversationID string, leafID int64) (bool, error) {
	key := fmt.Sprintf(keyNodeSummaryLock, conversationID, leafID)
	n, err := r.rdb.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}