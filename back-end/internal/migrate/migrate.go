package migrate

import (
	"github.com/luhao/contextGraph/internal/model"
	"gorm.io/gorm"
)

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.User{},
		&model.Canvas{},
		&model.Node{},
		&model.NodeEdge{},
		&model.Message{},
		&model.AiModel{},
		&model.TokenUsageLog{},
		&model.File{},
		&model.Conversation{},
	)
}