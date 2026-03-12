package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/dto"
	apperr "github.com/luhao/contextGraph/pkg/errors"
)

// InternalTokenMiddleware validates the X-Internal-Token header for internal API calls (ai-service → Go backend).
func InternalTokenMiddleware(expectedToken string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-Internal-Token")
		if token == "" || token != expectedToken {
			c.JSON(http.StatusUnauthorized, dto.Error(apperr.BizUnauthorized, "Unauthorized"))
			c.Abort()
			return
		}
		c.Next()
	}
}
