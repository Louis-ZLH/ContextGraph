package middleware

import (
	"context"
	"fmt"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/dto"
	apperr "github.com/luhao/contextGraph/pkg/errors"
	"github.com/redis/go-redis/v9"
)

const maxConcurrentStreams = 2

// Lua 脚本：原子 INCR + 上限检查，超限则 DECR 回退
var acquireScript = redis.NewScript(`
local key = KEYS[1]
local max = tonumber(ARGV[1])
local cur = redis.call('INCR', key)
if cur == 1 then
    redis.call('EXPIRE', key, 300)
end
if cur > max then
    redis.call('DECR', key)
    return 0
end
return 1
`)

// StreamLimitMiddleware 限制每个用户同时最多运行 maxConcurrentStreams 个 SSE 流
func StreamLimitMiddleware(rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
			c.Abort()
			return
		}

		key := fmt.Sprintf("sse:concurrent:%d", userID.(int64))
		result, err := acquireScript.Run(c.Request.Context(), rdb, []string{key}, maxConcurrentStreams).Int64()
		if err != nil {
			c.JSON(http.StatusInternalServerError, dto.Error(apperr.BizUnknown, "Internal server error"))
			c.Abort()
			return
		}
		if result == 0 {
			c.JSON(http.StatusTooManyRequests, dto.Error(apperr.BizTooManyStreams, "Too many concurrent streams, please try again later"))
			c.Abort()
			return
		}

		// 用 sync.Once 确保只释放一次，防止 c.Next() 返回和 context.Done 同时触发导致双重 DECR
		var once sync.Once
		release := func() {
			once.Do(func() {
				rdb.Decr(context.Background(), key)
			})
		}

		// 客户端断连时通过 context 取消释放
		go func() {
			<-c.Request.Context().Done()
			release()
		}()

		c.Next()

		// handler 正常返回后释放
		release()
	}
}
