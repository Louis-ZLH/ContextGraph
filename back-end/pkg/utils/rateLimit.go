package utils

import (
	"context"
	"time"

	"github.com/luhao/contextGraph/internal/script"
	"github.com/redis/go-redis/v9"
)

const (
	empty = "§_EMPTY_§"
)

var rateLimitScript = redis.NewScript(script.CheckRateLimitScript)

func CheckRateLimit(ctx context.Context, rdb *redis.Client, key string, limit int, window time.Duration) (bool, error) {
	// 使用 Lua 脚本原子化 INCR + EXPIRE
	windowSeconds := int(window.Seconds())

	result, err := rateLimitScript.Run(ctx, rdb, []string{key}, limit, windowSeconds).Int64()
	if err != nil {
		return false, err
	}

	// 判断是否超限
	if result > int64(limit) {
		return false, nil // 超过限制
	}

	return true, nil // 允许通行
}