package dto

import "time"

type CreateCanvasResponse struct {
	CanvasID int64 `json:"canvas_id,string"`
}

type ListCanvasResponse struct {
	CanvasList []Canvas `json:"canvas_list"`
}

type Canvas struct {
	ID int64 `json:"id,string"`
	Title string `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}