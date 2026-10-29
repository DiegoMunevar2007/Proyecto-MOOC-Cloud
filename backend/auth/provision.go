package auth

import (
	"encoding/json"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"io"
	"strings"
)

// ProvisionAdmin solo se invoca como comando por un operador con acceso al
// contenedor. Lee la contraseña por stdin, nunca por argumentos ni logs.
func ProvisionAdmin(db *gorm.DB, input io.Reader) error {
	var in struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	decoder := json.NewDecoder(io.LimitReader(input, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&in) != nil || strings.TrimSpace(in.Username) == "" || !strings.Contains(in.Email, "@") || len(in.Password) < 12 || len(in.Password) > 72 {
		return errors.New("se requiere JSON por stdin con username, email y password de 12 a 72 bytes")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("no se pudo proteger la contraseña")
	}
	user := UserModel{Username: in.Username, Email: in.Email, Password: string(hash), Role: RoleAdmin, Status: StatusActive, IsVerified: true}
	if err := db.Create(&user).Error; err != nil {
		return errors.New("no se pudo crear la cuenta; comprobar si el usuario ya existe")
	}
	return nil
}
