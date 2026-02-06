package repo

import (
	"context"

	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type canvasRepo struct{
	db *gorm.DB
	rdb *redis.Client
}

func NewCanvasRepo(db *gorm.DB, rdb *redis.Client) *canvasRepo {
	return &canvasRepo{db: db, rdb: rdb}
}

func (r *canvasRepo) CreateCanvas(ctx context.Context, userID int64) (int64, error) {
	var canvas model.Canvas
	canvas.UserID = userID
	canvas.Title = "Untitled Canvas"

	err := r.db.Create(&canvas).Error
	if err != nil {
		return 0, apperr.InternalError("Internal error while creating canvas")
	}
	return canvas.ID, nil
}

func (r *canvasRepo) ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error){
	var canvasList []model.Canvas
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&canvasList).Error
	if err != nil {
		return nil, apperr.InternalError("Internal error while listing canvas")
	}
	return canvasList, nil
}