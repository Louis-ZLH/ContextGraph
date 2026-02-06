package service

import "github.com/luhao/contextGraph/internal/model"

type UserService struct {
	userRepo userRepo
}

func NewUserService(userRepo userRepo) *UserService {
	return &UserService{userRepo: userRepo}
}

func (s *UserService) GetProfileByUserID(userID int64) (*model.User, error) {
	return s.userRepo.GetUserByID(userID)
}