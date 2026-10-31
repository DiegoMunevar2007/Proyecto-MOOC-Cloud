package utils

import (
	"fmt"

	"gorm.io/gorm"
)

// migrateLockKey es la clave del advisory lock que serializa las migraciones.
// Es un número fijo y no un hash calculado: todas las réplicas, de la API y del
// worker, tienen que pedir exactamente el mismo lock.
const migrateLockKey int64 = 0x6d6f6f63 // "mooc"

// MigrateWithLock ejecuta AutoMigrate con un advisory lock de PostgreSQL, para
// que varias réplicas arrancando a la vez no migren el esquema en paralelo.
//
// Con una sola VM por rol no hacía falta. Con grupos que escalan, el autoscaler
// puede levantar dos API y un worker en el mismo minuto, y AutoMigrate no es
// atómico: dos procesos que crean la misma tabla chocan con
// "duplicate key value violates unique constraint pg_type_typname_nsp_index", y
// el que pierde no arranca. Con el lock, la primera réplica migra y las demás
// esperan y encuentran el esquema ya al día.
//
// El lock es de sesión, así que todo tiene que pasar por la misma conexión del
// pool: db.Connection la fija durante la función. pg_advisory_lock espera sin
// límite; si la réplica que migra muere, PostgreSQL libera el lock al cerrar su
// conexión.
func MigrateWithLock(db *gorm.DB, models ...interface{}) error {
	return db.Connection(func(conn *gorm.DB) error {
		if err := conn.Exec("SELECT pg_advisory_lock(?)", migrateLockKey).Error; err != nil {
			return fmt.Errorf("no se pudo tomar el lock de migración: %w", err)
		}
		defer conn.Exec("SELECT pg_advisory_unlock(?)", migrateLockKey)
		return conn.AutoMigrate(models...)
	})
}
