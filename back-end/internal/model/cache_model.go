package model

import "encoding/json"

type SessionUserData struct {
    UserID   int64  `json:"user_id"`
    Email    string `json:"email"`
    Username string `json:"username"`
    Plan     string `json:"plan"`
    UA       string `json:"ua"`
    IP       string `json:"ip"`
    AuthVersion int64 `json:"auth_version"`
}

// MarshalBinary 让结构体自动支持 Redis Set
func (s *SessionUserData) MarshalBinary() (data []byte, err error) {
	return json.Marshal(s)
}

// UnmarshalBinary 让结构体自动支持 Redis Scan
func (s *SessionUserData) UnmarshalBinary(data []byte) error {
	return json.Unmarshal(data, s)
}
