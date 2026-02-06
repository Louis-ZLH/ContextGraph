package dto

type UserProfileResponse struct {
	UserID   int64  `json:"user_id,string"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Plan     string `json:"plan"`
	AvatarURL string `json:"avatar_url"`
	TokenQuota int64  `json:"token_quota,string"`
}