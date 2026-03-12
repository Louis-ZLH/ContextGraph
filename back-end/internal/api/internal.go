package api

import (
	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/app"
	"github.com/luhao/contextGraph/internal/middleware"
)

func NewInternalRouter(api *gin.RouterGroup, a *app.App) {
	internal := api.Group("/internal", middleware.InternalTokenMiddleware(a.Cfg.InternalToken))

	internal.POST("/ai/file", a.H.InternalHandler.RegisterAIGeneratedFile)
	internal.PATCH("/messages/:message_id/usage", a.H.InternalHandler.UpdateMessageUsage)
}
