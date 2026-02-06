package dto

// SendCodeRequest 发送验证码请求
type SendCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
	Type string `json:"type" binding:"required,oneof=register reset_password"`
}

// VerifyCodeRequest 验证验证码请求
type VerifyCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
	Type string `json:"type" binding:"required,oneof=register reset_password"`
}

// RegisterRequest 注册请求
type RegisterRequest struct {
	Password string `json:"password" binding:"required,min=8,max=32"`
	Username string `json:"username" binding:"required,min=3,max=20"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// SendCodeResponse 发送验证码响应（生产环境不应返回code）
type SendCodeResponse struct {
	Message string `json:"message"`
}

type ResetPasswordRequest struct {
	Password string `json:"password" binding:"required,min=8,max=32"`
}


// =============================== Responses ===============================

// RegisterResponse 注册响应
type RegisterResponse struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Token    string `json:"token"`
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
}
