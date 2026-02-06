package repo

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
	"github.com/luhao/contextGraph/pkg/utils"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type UserRepo struct {
	db *gorm.DB
	rdb *redis.Client
}

const BloomFilterKey = "user_filter"

func NewUserRepo(db *gorm.DB, rdb *redis.Client) *UserRepo {
	return &UserRepo{db: db, rdb: rdb}
}

func (r *UserRepo) StoreVerificationCode(ctx context.Context, email, code, reqType string) error {
    redisKey := reqType + ":verify_code:" + email
    err := r.rdb.Set(ctx, redisKey, code, time.Minute).Err()
    
    if err != nil {
        return apperr.InternalError("redis error");
    }
    
    return nil
}

func (r *UserRepo) GetVerificationCode(ctx context.Context, email string, reqType string) (string, error) {
	redisKey := reqType + ":verify_code:" + email
	code, err := r.rdb.Get(ctx, redisKey).Result()
	if err == redis.Nil {
		return "", apperr.NotFound("please request a new code")
	} else if err != nil {
		return "", apperr.InternalError("redis error")
	}
	return code, nil
}

func (r *UserRepo) DeleteVerificationCodeIfExist(ctx context.Context, email string, reqType string) error {
	redisKey := reqType + ":verify_code:" + email
	_, err := r.rdb.Del(ctx, redisKey).Result()
	if err != nil {
		return apperr.InternalError("redis error")
	}
	return nil
}

func (r *UserRepo) StoreSessionData(ctx context.Context, userID string, sessionID string, data *model.SessionUserData, expiration time.Duration) error {
	redisKey := "user:" + userID + ":refresh:" + sessionID
	err := r.rdb.Set(ctx, redisKey, data, expiration).Err()
	if err != nil {
		return apperr.InternalError("redis error")
	}
	return nil
}

func (r *UserRepo) CreateUser(ctx context.Context, user *model.User) error {
	err := r.db.Create(user).Error
	if err != nil {
		if isDuplicateKeyError(err) {
			return apperr.EmailExists()
		}
		return apperr.InternalError("database error")
	}

	err = r.rdb.BFAdd(ctx, BloomFilterKey, user.Email).Err()
	if err != nil {
		log.Printf("Could not add email to bloom filter: %v", err)
	}

	return nil
}

func (r *UserRepo) UpdateUserPassword(ctx context.Context, tx *gorm.DB, userID int64, newHashedPassword string) (int64, error) {
    // 定义核心业务逻辑：接收一个 db 对象（不管是事务还是普通连接）
    doUpdate := func(db *gorm.DB) (int64, error) {
        // 1. 执行更新
        result := db.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
            "password":     newHashedPassword,
            "auth_version": gorm.Expr("auth_version + ?", 1),
        })

        if result.Error != nil {
            return 0, apperr.InternalError("database error")
        }
        if result.RowsAffected == 0 {
            return 0, apperr.NotFound("user not found")
        }

        // 2. 查询最新版本号
        var user model.User
        if err := db.Select("auth_version").First(&user, userID).Error; err != nil {
            return 0, apperr.InternalError("failed to retrieve updated version")
        }
        
        return user.Auth_version, nil
    }

    // ================= 分支判断 =================

    // 情况 A: 外界传入了有效的 tx
    // 直接使用传入的事务，不负责提交/回滚（由外界控制）
    if tx != nil {
        return doUpdate(tx)
    }

    // 情况 B: 外界传入 nil
    // 内部开启一个新的临时事务，保证原子性
    var finalVersion int64
    err := r.db.WithContext(ctx).Transaction(func(internalTx *gorm.DB) error {
        v, err := doUpdate(internalTx)
        if err != nil {
            return err // 返回错误会自动回滚
        }
        finalVersion = v
        return nil // 返回 nil 会自动提交
    })

    return finalVersion, err
}

func (r *UserRepo) GetUserByEmail(email string) (*model.User, error) {
	mayExist, err := r.rdb.BFExists(context.Background(), BloomFilterKey, email).Result()
	if err != nil {
		log.Printf("Could not check bloom filter: %v", err)
	} else if !mayExist {
		log.Printf("[DEBUG] bloom filter rejected email: %q", email)
		return nil, apperr.NotFound("user not found")
	}

	var user model.User
	result := r.db.Where("email = ?", email).First(&user)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, apperr.NotFound("user not found")
		}
		return nil, apperr.InternalError("database error")
	}
	return &user, nil
}

func (r *UserRepo) GetUserByID(userID int64) (*model.User, error) {
	var user model.User
	result := r.db.First(&user, userID)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, apperr.NotFound("user not found")
		}
		return nil, apperr.InternalError("database error")
	}
	return &user, nil
}

func (r *UserRepo) IsEmailRegistered(email string) (bool, error) {
	mayExist, err := r.rdb.BFExists(context.Background(), BloomFilterKey, email).Result()
	if err != nil {
		log.Printf("Could not check bloom filter: %v", err)
	} else if !mayExist {
		return false, nil
	}

	var count int64
	result := r.db.Model(&model.User{}).Where("email = ?", email).Count(&count)
	if result.Error != nil {
		return false, apperr.InternalError("database error")
	}
	return count > 0, nil
}

func (r *UserRepo) CountUserSessions(ctx context.Context, userID string) (int64, error) {
	pattern := "user:" + userID + ":refresh:*"
	var count int64
	iter := r.rdb.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		count++
	}
	if err := iter.Err(); err != nil {
		return 0, apperr.InternalError("redis error")
	}
	return count, nil
}

func (r *UserRepo) DeleteSessionData(ctx context.Context, rdbKey string) error {
	_, err := r.rdb.Del(ctx, rdbKey).Result()
	if err != nil {
		return apperr.InternalError("redis error")
	}
	return nil
}

func (r *UserRepo) DeleteSessionDataByUserID(ctx context.Context, userID string) error {
    pattern := "user:" + userID + ":refresh:*"
    // 优化 1: 将 Count 设置为 10 或更大（默认是 10），可以减少 Scan 的交互次数
    iter := r.rdb.Scan(ctx, 0, pattern, 10).Iterator()
    // 优化 2: 初始化 Pipeline
    pipe := r.rdb.Pipeline()
    keysCount := 0
    for iter.Next(ctx) {
        pipe.Del(ctx, iter.Val()) 
        keysCount++
    }

    if err := iter.Err(); err != nil {
        return apperr.InternalError("redis scan error")
    }

    // 只有当有 key 需要删除时才执行 Pipeline
    if keysCount > 0 {
        // 优化 3: 一次性发送所有删除命令
        _, err := pipe.Exec(ctx)
        if err != nil {
            return apperr.InternalError("redis delete error")
        }
    }
    return nil
}

func (r *UserRepo) DeleteVersionInfo(ctx context.Context, userID string) error {
	key := "user:" + userID + ":version";
	_, err := r.rdb.Del(ctx, key).Result()
	if err != nil {
		return apperr.InternalError("redis error")
	}
	return nil
}

func (r *UserRepo) CheckRateLimit(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
    return utils.CheckRateLimit(ctx, r.rdb, key, limit, window)
}

func (r *UserRepo) SyncBloomFilter(ctx context.Context) {
    go func() {
        const batchSize = 100
        const sleepDuration = 100 * time.Millisecond
        
        var offset int
        var total int
        
        for {
            var emails []string
            result := r.db.Model(&model.User{}).
                Offset(offset).
                Limit(batchSize).
                Pluck("email", &emails)
            
            if result.Error != nil {
                log.Printf("sync bloom filter error: %v", result.Error)
                return
            }
            
            if len(emails) == 0 {
                break
            }
            
            // 使用 Pipeline 批量添加
            pipe := r.rdb.Pipeline()
            for _, email := range emails {
                pipe.BFAdd(ctx, BloomFilterKey, email)
            }
            if _, err := pipe.Exec(ctx); err != nil {
                log.Printf("pipeline exec error: %v", err)
            }
            
            total += len(emails)
            offset += batchSize
            
            time.Sleep(sleepDuration)
        }
        
        log.Printf("bloom filter sync completed: %d emails", total)
    }()
}

func (r *UserRepo) BeginTX(ctx context.Context) *gorm.DB {
	return r.db.Begin()
}

func isDuplicateKeyError(err error) bool {
    return strings.Contains(err.Error(), "Duplicate entry") ||
           strings.Contains(err.Error(), "1062")
}