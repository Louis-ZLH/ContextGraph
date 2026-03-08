package model

type File struct {
	BaseModel
	UserID      int64  `gorm:"index;not null" json:"user_id,string"`
	MinioPath   string `gorm:"type:varchar(512);not null" json:"minio_path"`
	Filename    string `gorm:"type:varchar(255);not null" json:"filename"`
	FileSize    int64  `gorm:"not null" json:"file_size"`                    // 字节
	ContentType string `gorm:"type:varchar(128);not null" json:"content_type"` // MIME type
}
