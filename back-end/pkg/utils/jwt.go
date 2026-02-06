package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// 定义你的密钥（实际项目中应该从 config 包读取）

// MyClaims 自定义载荷，可以加 UserID, Role 等
type VerifyPayLoad struct {
	Email  string `json:"email"`
	jwt.RegisteredClaims // 包含过期时间 (exp), 签发人 (iss) 等标准字段
}

type AuthPayLoad struct {
	UserID int64  `json:"user_id"`
    Email  string `json:"email"`
    Username string `json:"username"`
    Plan  string `json:"plan"`
	AuthVersion int64    `json:"auth_version"`
	jwt.RegisteredClaims
}

var jwtSecret []byte

func InitJWTSecret(secret string) {
	jwtSecret = []byte(secret)
}

// GenerateVerificationToken 生成 Token
func GenerateVerificationToken(email string) (string, error) {
	claims := VerifyPayLoad{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)), // 5分钟后过期
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "contextGraph",
		},
	}

	// 使用 HS256 签名算法
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ParseToken 解析并校验 Token
func ParseVerificationToken(tokenString string) (*VerifyPayLoad, error) {
	// 解析 token
	token, err := jwt.ParseWithClaims(tokenString, &VerifyPayLoad{}, func(token *jwt.Token) (interface{}, error) {
		// ！！！非常重要：必须验证签名算法，防止 header 修改攻击
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	// 验证 Claims 类型和 Token 是否有效
	if claims, ok := token.Claims.(*VerifyPayLoad); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

func GenerateAuthToken(userID int64,email string,username string,plan string, authVersion int64) (string, error) {
	claims := AuthPayLoad{
		UserID: userID,
		Email: email,
		Username: username,
		Plan: plan,
		AuthVersion: authVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * time.Minute)), // 30分钟后过期
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "contextGraph",
		},
	}
	// 使用 HS256 签名算法
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func ParseAuthToken(tokenString string) (*AuthPayLoad, error) {
    token, err := jwt.ParseWithClaims(tokenString, &AuthPayLoad{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, errors.New("unexpected signing method")
        }
        return jwtSecret, nil
    })

    // 先尝试提取 claims
    claims, ok := token.Claims.(*AuthPayLoad)
    
    if err != nil {
        // 过期但 claims 有效，返回 claims + 过期错误
        if errors.Is(err, jwt.ErrTokenExpired) && ok {
            return claims, ErrTokenExpired
        }
        return nil, ErrTokenInvalid
    }

    if ok && token.Valid {
        return claims, nil
    }

    return nil, ErrTokenInvalid
}

// 自定义错误，方便上层判断
var (
	ErrTokenExpired = errors.New("token expired")
	ErrTokenInvalid = errors.New("token invalid")
)

