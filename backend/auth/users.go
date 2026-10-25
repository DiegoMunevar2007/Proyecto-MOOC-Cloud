package auth

import (
	"github.com/gin-gonic/gin"
)

// UserFromContext lee el id y el rol que RequireRole dejó en el contexto desde
// los claims firmados. Evita una consulta a la base de datos por petición.
func UserFromContext(c *gin.Context) (uint, string) {
	uid, _ := c.Get("user_id")
	id, _ := uid.(uint)
	return id, NormalizeRole(c.GetString("role"))
}
