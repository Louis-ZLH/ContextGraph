package idgen

import (
	"math/rand"
	"strings"

	"github.com/google/uuid" // 需要 go get github.com/google/uuid
)

// 生成6位数字验证码
func RandomNumbers(n int) string {
    var sb strings.Builder
    for i := 0; i < n; i++ {
        sb.WriteByte(byte(rand.Intn(10) + '0'))
    }
    return sb.String()
}

// 生成随机用户名
func RandomUserName(prefix string) string {
    return prefix + RandomString(10)
}

func RandomString(n int) string {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    b := make([]byte, n)
    for i := range b {
        b[i] = letters[rand.Intn(len(letters))]
    }
    return string(b)
}

// 生成UUID Token (简单UUID，不带中划线)
func UUID() string {
    return strings.ReplaceAll(uuid.New().String(), "-", "")
}