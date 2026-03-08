package api

import (
	"github.com/gin-gonic/gin"
	"github.com/luhao/contextGraph/internal/app"
	"github.com/luhao/contextGraph/internal/middleware"
)

func NewFileRouter(api *gin.RouterGroup, a *app.App) {
	fileApi := api.Group("/file")

	fileApi.Use(middleware.AuthMiddleware(a.RDB, a.DB))
	fileApi.GET("/list", a.H.FileHandler.ListFiles)
	fileApi.POST("/upload", a.H.FileHandler.UploadFile)
	fileApi.GET("/:id", a.H.FileHandler.DownloadFile)
	fileApi.GET("/:id/info", a.H.FileHandler.GetFileInfo)
	fileApi.POST("/bind-node", a.H.FileHandler.BindFileToNode)
	fileApi.DELETE("/:id", a.H.FileHandler.DeleteFile)
}