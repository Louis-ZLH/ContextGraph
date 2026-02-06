package verify

import (
	"fmt"
)

func IsValidPassword(password string) (bool, error) {
    if password == "" {
        return false, fmt.Errorf("password cannot be empty")
    }

    if len(password) < 8 || len(password) > 32 {
        return false, fmt.Errorf("password length must be between 8 and 32 characters")
    }

    var hasUpper, hasLower, hasNumber, hasSpecial bool
    for _, char := range password {
        switch {
        case char >= 'A' && char <= 'Z':
            hasUpper = true
        case char >= 'a' && char <= 'z':
            hasLower = true
        case char >= '0' && char <= '9':
            hasNumber = true
        case (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9'):
            hasSpecial = true
        }
    }

    if !hasUpper {
        return false, fmt.Errorf("password must contain at least one uppercase letter")
    }
    if !hasLower {
        return false, fmt.Errorf("password must contain at least one lowercase letter")
    }
    if !hasNumber {
        return false, fmt.Errorf("password must contain at least one number")
    }
    if !hasSpecial {
        return false, fmt.Errorf("password must contain at least one special character")
    }

    return true, nil
}