package utils

import (
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Esta prueba habla con un PostgreSQL real: lo que se comprueba es la
// semántica del advisory lock y la carrera de CREATE TABLE en el catálogo, que
// un doble no reproduce.
//
// Se omite si no hay base de datos. Para correrla:
//
//	docker compose up -d postgres
//	POSTGRES_TEST_DSN="host=localhost user=postgres password=postgres dbname=mydb port=5432 sslmode=disable" \
//	  go test ./utils/ -run TestMigrateWithLock -v

// Modelos propios de la prueba: varias tablas con relaciones, para que cada
// réplica tenga varias sentencias DDL que intercalar con las de las demás.
type migraCurso struct {
	ID      uint `gorm:"primaryKey"`
	Titulo  string
	Modulos []migraModulo `gorm:"foreignKey:CursoID"`
}

type migraModulo struct {
	ID      uint `gorm:"primaryKey"`
	CursoID uint `gorm:"index"`
	Nombre  string
	Orden   int
}

type migraRecurso struct {
	ID       uint   `gorm:"primaryKey"`
	ModuloID uint   `gorm:"index"`
	Clave    string `gorm:"uniqueIndex"`
}

func TestMigrateWithLockConcurrente(t *testing.T) {
	dsn := os.Getenv("POSTGRES_TEST_DSN")
	if dsn == "" {
		t.Skip("POSTGRES_TEST_DSN no está definido; se omite la prueba de integración")
	}

	// Un esquema propio por corrida: no toca las tablas de la aplicación y
	// cada réplica arranca contra un esquema vacío, que es el caso de la carrera.
	admin, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("conectar: %v", err)
	}
	esquema := fmt.Sprintf("mooc_migrate_test_%d", time.Now().UnixNano())
	if err := admin.Exec("CREATE SCHEMA " + esquema).Error; err != nil {
		t.Fatalf("crear esquema: %v", err)
	}
	t.Cleanup(func() {
		admin.Exec("DROP SCHEMA " + esquema + " CASCADE")
		if sqlDB, err := admin.DB(); err == nil {
			sqlDB.Close()
		}
	})

	const replicas = 8
	var (
		listas sync.WaitGroup
		salida = make(chan struct{})
		fin    sync.WaitGroup
		errs   = make(chan error, replicas)
	)
	for i := 0; i < replicas; i++ {
		listas.Add(1)
		fin.Add(1)
		go func(i int) {
			defer fin.Done()
			// Cada réplica con su propio pool, como procesos separados.
			db, err := gorm.Open(postgres.Open(dsn+" search_path="+esquema), &gorm.Config{Logger: logger.Discard})
			listas.Done()
			if err != nil {
				errs <- fmt.Errorf("réplica %d: conectar: %w", i, err)
				return
			}
			defer func() {
				if sqlDB, err := db.DB(); err == nil {
					sqlDB.Close()
				}
			}()
			<-salida
			if err := MigrateWithLock(db, &migraCurso{}, &migraModulo{}, &migraRecurso{}); err != nil {
				errs <- fmt.Errorf("réplica %d: %w", i, err)
			}
		}(i)
	}
	// Todas salen a la vez para maximizar la carrera.
	listas.Wait()
	close(salida)
	fin.Wait()
	close(errs)

	for err := range errs {
		t.Error(err)
	}

	var tablas int64
	admin.Raw(`SELECT count(*) FROM information_schema.tables WHERE table_schema = ?`, esquema).Scan(&tablas)
	if tablas != 3 {
		t.Errorf("se esperaban 3 tablas en %s y hay %d", esquema, tablas)
	}

	// El lock tiene que quedar libre: si alguna réplica no lo soltó, la
	// siguiente que arranque quedaría bloqueada para siempre.
	// Se comprueba en una sola conexión porque el lock es de sesión.
	_ = admin.Connection(func(conn *gorm.DB) error {
		var libre bool
		conn.Raw("SELECT pg_try_advisory_lock(?)", migrateLockKey).Scan(&libre)
		if !libre {
			t.Error("el advisory lock de migración quedó tomado tras migrar")
			return nil
		}
		return conn.Exec("SELECT pg_advisory_unlock(?)", migrateLockKey).Error
	})
}
