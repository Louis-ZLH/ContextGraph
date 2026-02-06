package dto

import errors "github.com/luhao/contextGraph/pkg/errors"

// Response 通用响应结构
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// 常用响应消息
const (
	MsgSuccess      = "success"
	MsgBadRequest   = "bad request"
	MsgUnauthorized = "unauthorized"
	MsgServerError  = "internal server error"
)

// Success 成功响应
func Success(data interface{}) Response {
	return Response{
		Code:    errors.BizSuccess,
		Message: MsgSuccess,
		Data:    data,
	}
}

func SuccessMsg(msg string) Response {
	return Response{
		Code:    errors.BizSuccess,
		Message: msg,
	}
}

// Error 错误响应
func Error(code int, message string) Response {
	return Response{
		Code:    code,
		Message: message,
	}
}