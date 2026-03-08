package repo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/luhao/contextGraph/internal/infra"
	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
	"github.com/minio/minio-go/v7"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	fileProcessingTTL = 5 * time.Minute
	fileCacheTTL      = 24 * time.Hour
)

type FileRepo struct {
	db          *gorm.DB
	rdb         *redis.Client
	mq          *infra.RabbitMQ
	minioClient *minio.Client
	bucket      string
}

func NewFileRepo(db *gorm.DB, rdb *redis.Client, mq *infra.RabbitMQ, minioClient *minio.Client, bucket string) *FileRepo {
	return &FileRepo{db: db, rdb: rdb, mq: mq, minioClient: minioClient, bucket: bucket}
}

// UploadToMinio 上传文件到 MinIO，返回存储路径
func (r *FileRepo) UploadToMinio(ctx context.Context, userID int64, file io.Reader, filename string, fileSize int64, contentType string) (string, error) {
	// 生成唯一路径: users/{user_id}/{uuid}_{filename}
	objectName := fmt.Sprintf("users/%d/%s_%s", userID, uuid.New().String(), filename)

	_, err := r.minioClient.PutObject(ctx, r.bucket, objectName, file, fileSize, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", apperr.Wrap(err, 500, apperr.BizUnknown, "文件上传至存储服务失败")
	}

	return objectName, nil
}

// CreateFileRecord 在数据库中创建文件记录
func (r *FileRepo) CreateFileRecord(ctx context.Context, fileRecord *model.File) error {
	if err := r.db.WithContext(ctx).Create(fileRecord).Error; err != nil {
		return apperr.Wrap(err, 500, apperr.BizUnknown, "保存文件记录失败")
	}
	return nil
}

// GetFileByID 根据 ID 查询文件记录
func (r *FileRepo) GetFileByID(ctx context.Context, fileID int64) (*model.File, error) {
	var file model.File
	if err := r.db.WithContext(ctx).First(&file, fileID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperr.NotFound("文件不存在")
		}
		return nil, apperr.Wrap(err, 500, apperr.BizUnknown, "查询文件记录失败")
	}
	return &file, nil
}

// GetFileFromMinio 从 MinIO 获取文件对象
func (r *FileRepo) GetFileFromMinio(ctx context.Context, minioPath string) (*minio.Object, error) {
	obj, err := r.minioClient.GetObject(ctx, r.bucket, minioPath, minio.GetObjectOptions{})
	if err != nil {
		return nil, apperr.Wrap(err, 500, apperr.BizUnknown, "获取文件失败")
	}
	return obj, nil
}

// GetNodeWithCanvasUserID 查询节点及其所属画布的 userID
func (r *FileRepo) GetNodeWithCanvasUserID(ctx context.Context, nodeID string) (*model.Node, int64, error) {
	var node model.Node
	if err := r.db.WithContext(ctx).First(&node, "id = ?", nodeID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, 0, apperr.NotFound("节点不存在")
		}
		return nil, 0, apperr.Wrap(err, 500, apperr.BizUnknown, "查询节点失败")
	}

	var canvasUserID int64
	err := r.db.WithContext(ctx).Model(&model.Canvas{}).
		Select("user_id").
		Where("id = ?", node.CanvasID).
		Scan(&canvasUserID).Error
	if err != nil {
		return nil, 0, apperr.Wrap(err, 500, apperr.BizUnknown, "查询画布信息失败")
	}

	return &node, canvasUserID, nil
}

// UpdateNodeFileID 更新节点的 file_id
func (r *FileRepo) UpdateNodeFileID(ctx context.Context, nodeID string, fileID *int64) error {
	result := r.db.WithContext(ctx).Model(&model.Node{}).Where("id = ?", nodeID).Update("file_id", fileID)
	if result.Error != nil {
		return apperr.Wrap(result.Error, 500, apperr.BizUnknown, "更新节点文件绑定失败")
	}
	if result.RowsAffected == 0 {
		return apperr.NotFound("节点不存在")
	}
	return nil
}

// SetFileProcessingKeys 同时设置 file:wait_to_process 和 file:processing Redis key（TTL=5min）
func (r *FileRepo) SetFileProcessingKeys(ctx context.Context, fileID int64) error {
	pipe := r.rdb.Pipeline()
	waitKey := fmt.Sprintf("file:wait_to_process:%d", fileID)
	procKey := fmt.Sprintf("file:processing:%d", fileID)
	pipe.Set(ctx, waitKey, "1", fileProcessingTTL)
	pipe.Set(ctx, procKey, "1", fileProcessingTTL)
	_, err := pipe.Exec(ctx)
	return err
}

// fileConvertMessage 是发送到 RabbitMQ 的文件转换消息体
type fileConvertMessage struct {
	FileID      int64  `json:"file_id"`
	MinioPath   string `json:"minio_path"`
	ContentType string `json:"content_type"`
}

// PublishFileConvert 发布文件转换消息到 ai_exchange，routing key ai.file.convert
func (r *FileRepo) PublishFileConvert(ctx context.Context, fileID int64, minioPath string, contentType string) error {
	body, err := json.Marshal(fileConvertMessage{
		FileID:      fileID,
		MinioPath:   minioPath,
		ContentType: contentType,
	})
	if err != nil {
		return err
	}
	return r.mq.PubChannel.PublishWithContext(ctx,
		"ai_exchange",     // exchange
		"ai.file.convert", // routing key
		false,             // mandatory
		false,             // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
}

// ========== 文件内容获取（Phase 3: 上下文组装用） ==========

// GetFileTextCache 从 Redis 获取文件文本缓存
func (r *FileRepo) GetFileTextCache(ctx context.Context, fileID int64) (string, error) {
	key := fmt.Sprintf("file:text_cache:%d", fileID)
	return r.rdb.Get(ctx, key).Result()
}

// SetFileTextCache 将文件文本写入 Redis 缓存（TTL=24h）
func (r *FileRepo) SetFileTextCache(ctx context.Context, fileID int64, text string) error {
	key := fmt.Sprintf("file:text_cache:%d", fileID)
	return r.rdb.Set(ctx, key, text, fileCacheTTL).Err()
}

// GetFileSummaryCache 从 Redis 获取文件摘要缓存
func (r *FileRepo) GetFileSummaryCache(ctx context.Context, fileID int64) (string, error) {
	key := fmt.Sprintf("file:summary_cache:%d", fileID)
	return r.rdb.Get(ctx, key).Result()
}

// SetFileSummaryCache 将文件摘要写入 Redis 缓存（TTL=24h）
func (r *FileRepo) SetFileSummaryCache(ctx context.Context, fileID int64, summary string) error {
	key := fmt.Sprintf("file:summary_cache:%d", fileID)
	return r.rdb.Set(ctx, key, summary, fileCacheTTL).Err()
}

// IsFileProcessing 检查文件是否正在预处理中
func (r *FileRepo) IsFileProcessing(ctx context.Context, fileID int64) (bool, error) {
	key := fmt.Sprintf("file:processing:%d", fileID)
	n, err := r.rdb.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// GetMinioObjectBytes 从 MinIO 读取对象的完整字节内容
func (r *FileRepo) GetMinioObjectBytes(ctx context.Context, minioPath string) ([]byte, error) {
	obj, err := r.minioClient.GetObject(ctx, r.bucket, minioPath, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	return io.ReadAll(obj)
}

// MinioObjectExists 检查 MinIO 对象是否存在
func (r *FileRepo) MinioObjectExists(ctx context.Context, minioPath string) (bool, error) {
	_, err := r.minioClient.StatObject(ctx, r.bucket, minioPath, minio.StatObjectOptions{})
	if err != nil {
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchKey" {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// ListMinioObjects 列出指定前缀下的所有 MinIO 对象路径（按名称排序）
func (r *FileRepo) ListMinioObjects(ctx context.Context, prefix string) ([]string, error) {
	var paths []string
	objectCh := r.minioClient.ListObjects(ctx, r.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})
	for obj := range objectCh {
		if obj.Err != nil {
			return nil, obj.Err
		}
		paths = append(paths, obj.Key)
	}
	return paths, nil
}
