package errors

import (
	"fmt"
	"net/http"
)

// AppError 应用错误
type AppError struct {
	Code    int    // HTTP 状态码
	BizCode int    // 业务错误码
	Message string // 错误信息
	Err     error  // 原始错误
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// 业务错误码
const (
	// 通用错误 1000-1999
	BizSuccess       = 0
	BizPartialSuccess = 1
	BizUnknown       = 1000
	BizInvalidParams = 1001

	// 认证相关 2000-2999
	BizUnauthorized     = 2000
	BizTokenExpired     = 2001
	BizInvalidCode      = 2002
	BizCodeExpired      = 2003
	BizFrequentRequest  = 2004
	BizEmailExists      = 2005
	BizEmailNotFound    = 2006
	BizPasswordWrong    = 2007

	// 用户相关 3000-3999
	BizUserNotFound = 3000

	// 资源相关 4000-4999
	BizNotFound   = 4000
	BizForbidden  = 4001
	BizConflict   = 4002
)

// ==================== 构造函数 ====================

// New 创建业务错误
func New(code, bizCode int, message string) *AppError {
	return &AppError{
		Code:    code,
		BizCode: bizCode,
		Message: message,
	}
}

// Wrap 包装原始错误
func Wrap(err error, code, bizCode int, message string) *AppError {
	return &AppError{
		Code:    code,
		BizCode: bizCode,
		Message: message,
		Err:     err,
	}
}

// ==================== 常用错误 ====================

// 通用
func BadRequest(message string) *AppError {
	return New(http.StatusBadRequest, BizInvalidParams, message)
}

func InternalError(message string) *AppError {
	return New(http.StatusInternalServerError, BizUnknown, message)
}

func NotFound(message string) *AppError {
	return New(http.StatusNotFound, BizNotFound, message)
}

func Forbidden(message string) *AppError {
	return New(http.StatusForbidden, BizForbidden, message)
}

func PartialSuccess(message string) *AppError {
	return New(http.StatusOK, BizPartialSuccess, message)
}

func Conflict(message string) *AppError {
	return New(http.StatusConflict, BizConflict, message)
}

// 认证相关
func Unauthorized(message string) *AppError {
	return New(http.StatusUnauthorized, BizUnauthorized, message)
}

func InvalidCode() *AppError {
	return New(http.StatusBadRequest, BizInvalidCode, "验证码错误")
}

func CodeExpired() *AppError {
	return New(http.StatusBadRequest, BizCodeExpired, "验证码已过期")
}

func FrequentRequest() *AppError {
	return New(http.StatusTooManyRequests, BizFrequentRequest, "请求过于频繁，请稍后再试")
}

func EmailExists() *AppError {
	return New(http.StatusBadRequest, BizEmailExists, "邮箱已被注册")
}

func EmailFormatError() *AppError {
	return New(http.StatusBadRequest, BizInvalidParams, "邮箱格式错误")
}

func EmailNotFound() *AppError {
	return New(http.StatusBadRequest, BizEmailNotFound, "邮箱不存在")
}

func PasswordWrong() *AppError {
	return New(http.StatusBadRequest, BizPasswordWrong, "密码错误")
}

func PasswordSameAsOld() *AppError {
	return New(http.StatusBadRequest, BizInvalidParams, "新密码不能与旧密码相同")
}

// ==================== 工具函数 ====================

func JWTGeneratedError() *AppError {
	return New(http.StatusInternalServerError, BizUnknown, "JWT 生成错误")
}

func JWTParseError() *AppError {
	return New(http.StatusUnauthorized, BizUnauthorized, "JWT 解析错误")
}

func HashPasswordError() *AppError {
	return New(http.StatusInternalServerError, BizUnknown, "密码加密错误")
}


// ==================== 判断错误类型 ====================

// Is 判断是否为特定业务错误
func Is(err error, bizCode int) bool {
	if appErr, ok := err.(*AppError); ok {
		return appErr.BizCode == bizCode
	}
	return false
}

// GetAppError 从 error 中提取 AppError
func GetAppError(err error) (*AppError, bool) {
	if appErr, ok := err.(*AppError); ok {
		return appErr, true
	}
	return nil, false
}
