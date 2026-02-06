package service

import (
	"context"

	"github.com/luhao/contextGraph/internal/model"
)

type canvasRepo interface {
	CreateCanvas(ctx context.Context, userID int64) (int64, error)
	ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error)
}

type canvasService struct {
	canvasRepo canvasRepo
}

func NewCanvasService(canvasRepo canvasRepo) *canvasService {
	return &canvasService{canvasRepo: canvasRepo}
}

func (s *canvasService) CreateCanvas(ctx context.Context, userID int64) (int64, error) {
	canasID, err := s.canvasRepo.CreateCanvas(ctx, userID)
	if err != nil {
		return 0, err
	}
	return canasID, err
}

func (s *canvasService) ListCanvas(ctx context.Context, userID int64) ([]model.Canvas, error) {
	canvasList, err := s.canvasRepo.ListCanvas(ctx, userID)
	if err != nil {
		return nil, err
	}
	return canvasList, nil
}