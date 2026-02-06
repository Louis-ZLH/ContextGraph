package app

import (
	"context"
	"log"
	"strings"

	"github.com/luhao/contextGraph/config"
	"github.com/luhao/contextGraph/internal/handler"
	"github.com/luhao/contextGraph/internal/infra"
	"github.com/luhao/contextGraph/internal/migrate"
	"github.com/luhao/contextGraph/internal/repo"
	"github.com/luhao/contextGraph/internal/service"
	"github.com/luhao/contextGraph/pkg/idgen"
	"github.com/luhao/contextGraph/pkg/utils"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type App struct {
	Cfg *config.Config
	DB  *gorm.DB
	RDB *redis.Client

	H *Handlers
}

func New(cfg *config.Config) (*App, error) {

	// 1. MySQL
	db, err := infra.NewMySQL(cfg.MySQLDSN)
	if err != nil {
		return nil, err
	}

	// 2. Redis
	rdb, err := infra.NewRedis(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err != nil {
		if sqlDB, e := db.DB(); e == nil {
			_ = sqlDB.Close()
		}
		return nil, err
	}

	// 3. migrate
	if err := migrate.AutoMigrate(db); err != nil {
		if rdb != nil { _ = rdb.Close() }
		if sqlDB, e := db.DB(); e == nil {
			_ = sqlDB.Close()
		}
		return nil, err
	}

	// 4. 初始化 Snowflake
	idgen.InitSnowflake(cfg.MachineID)

	// 5. 初始化 JWT Secret
	// 假设在 config 中有 JWTSecret 字段
	// 你可以根据你的实际配置结构进行调整
	utils.InitJWTSecret(cfg.JWTSecret)

	// 6. 初始化 Bloom Filter
	InitBloomFilter(context.Background(), rdb, db)


	return &App{
		Cfg: cfg,
		DB:  db,
		RDB: rdb,
		H:   wireHandlers(db, rdb),
	}, nil
}

func (a *App) Close(ctx context.Context) error {
	// 关闭 mysql
	if a.DB != nil {
		if sqlDB, err := a.DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	// 关闭 redis
	if a.RDB != nil {
		_ = a.RDB.Close()
	}
	return nil
}

type Handlers struct {
	AuthHandler *handler.AuthHandler
	UserHandler *handler.UserHandler
	CanvasHandler *handler.CanvasHandler
}

func wireHandlers(db *gorm.DB, rdb *redis.Client) *Handlers {
	// Auth
	userRepo := repo.NewUserRepo(db, rdb)
	authService := service.NewAuthService(userRepo)
	authHandler := handler.NewAuthHandler(authService)

	// User
	userSerice := service.NewUserService(userRepo)
	userHandler := handler.NewUserHandler(userSerice)

	// Canvas
	canvasRepo := repo.NewCanvasRepo(db, rdb)
	canvasService := service.NewCanvasService(canvasRepo)
	canvasHandler := handler.NewCanvasHandler(canvasService)


	return &Handlers{
		AuthHandler: authHandler,
		UserHandler: userHandler,
		CanvasHandler: canvasHandler,
	}
}

func InitBloomFilter(ctx context.Context, rdb *redis.Client, db *gorm.DB) {
    key := "user_filter"
    err := rdb.BFReserve(ctx, key, 0.01, 10000).Err()
	needSync := false

	if err == nil {
		needSync = true
	} else if strings.Contains(err.Error(), "exists") {
		// 已存在，检查是否需要同步
		log.Println("Bloom filter already exists")
		info, err := rdb.BFInfo(ctx, key).Result()
		if err == nil && info.ItemsInserted == 0 {
			needSync = true
		}
	} else {
		log.Printf("Could not reserve bloom filter: %v", err)
		return
	}
    
	if needSync {
		log.Println("Syncing Bloom Filter with existing users...")
		userRepo := repo.NewUserRepo(db, rdb)
		userRepo.SyncBloomFilter(ctx)
	}
}