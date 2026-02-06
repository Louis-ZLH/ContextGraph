package utils

import (
	"golang.org/x/crypto/bcrypt"
	apperr "github.com/luhao/contextGraph/pkg/errors"
)

// HashPassword 加密密码
func HashPassword(password string) (string, error) {
    // DefaultCost 目前是 10，数值越大，计算越慢，安全性越高
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", apperr.HashPasswordError()
	}
	return string(bytes), nil
}

// CheckPasswordHash 校验密码
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}