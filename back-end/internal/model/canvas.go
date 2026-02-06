package model

import "github.com/luhao/contextGraph/internal/dto"

type Canvas struct {
	BaseModel
	UserID    int64          `gorm:"index" json:"user_id,string"` // 加索引
	Title     string         `gorm:"type:varchar(100)" json:"title"`
}

func (c *Canvas) TableName() string {
	return "canvases"
}

func (c *Canvas) ToDTO() dto.Canvas {
    return dto.Canvas{
        ID:        c.ID,
        Title:     c.Title,
        UpdatedAt: c.UpdatedAt,
    }
}
