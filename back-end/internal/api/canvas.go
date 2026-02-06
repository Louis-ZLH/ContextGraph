package api

import (
	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/app"
	"github.com/luhao/contextGraph/internal/middleware"
)

func NewCanvasRouter(api *gin.RouterGroup, a *app.App) {
	canvasApi := api.Group("/canvas")

	canvasApi.Use(middleware.AuthMiddleware(a.RDB, a.DB))
	// Add canvas-related routes here
	canvasApi.POST("/create", a.H.CanvasHandler.CreateCanvas)
	canvasApi.GET("/list", a.H.CanvasHandler.ListCanvas)
}