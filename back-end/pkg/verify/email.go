package verify

import (
	"context"
	"net"
	"net/mail"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
)

type User struct {
    // tag 里的 email 标签已经帮你处理了大部分严谨逻辑
    Email string `validate:"required,email"` 
}

func IsValidEmail(email string) bool {
	// 1. 长度限制
	if len(email) < 3 || len(email) > 254 {
		return false
	}

	// 2. 标准库解析 (处理格式)
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return false
	}

	v := validator.New()
    u := User{Email: email}
    err = v.Struct(u)
    if err != nil {
		return false
    }


	// 3. 额外校验：ParseAddress 会通过 "Name <email@example.com>"，
	// 如果你只想要单纯的 email 地址，需要对比解析后的结果
	return addr.Address == email && !strings.Contains(email, "..")
}

// service/email.go

// 接收 context 作为第一个参数
func HasValidDomain(ctx context.Context, email string) bool {
    // ... 分割字符串逻辑 ...
    parts := strings.Split(email, "@")
    if len(parts) != 2 {
        return false
    }
    domain := parts[1]

    // 关键点：基于传入的 ctx (父级)，派生出一个带超时的子 ctx
    // 逻辑是：取 (父级剩余时间) 和 (2秒) 中较短的那个
    // 2秒对于 DNS 查询来说已经是"海量"时间了，通常 DNS 都在几十毫秒内完成
    dnsCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel() 

    var r net.Resolver

    // 使用派生出来的 dnsCtx
    mx, err := r.LookupMX(dnsCtx, domain)
    if err != nil || len(mx) == 0 {
        // 同样使用 dnsCtx
        if _, err := r.LookupIP(dnsCtx, "ip", domain); err != nil {
            return false
        }
    }
    return true
}