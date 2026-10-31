package utils

import (
	"log"
	"os"
	"strconv"
	"time"
)

// GetEnv obtiene el valor de una variable de entorno. Si no está definida, devuelve el valor por defecto.
func GetEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

// GetEnvInt lee un entero positivo del entorno. Un valor vacío, que no sea un
// número o que no sea mayor que cero devuelve el valor por defecto: un pool de
// cero conexiones o una concurrencia negativa nunca es lo que se quiso decir.
func GetEnvInt(key string, defaultValue int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		log.Printf("advertencia: %s=%q no es un entero positivo; se usa %d", key, raw, defaultValue)
		return defaultValue
	}
	return value
}

// GetEnvDuration lee una duración del entorno. Acepta el formato de Go ("25s",
// "1m30s") y también un entero, que se interpreta en segundos, porque es lo que
// se escribe a mano en un .env. Un valor inválido o no positivo devuelve el
// valor por defecto.
func GetEnvDuration(key string, defaultValue time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return defaultValue
	}
	if seconds, err := strconv.Atoi(raw); err == nil {
		if seconds > 0 {
			return time.Duration(seconds) * time.Second
		}
	} else if value, err := time.ParseDuration(raw); err == nil && value > 0 {
		return value
	}
	log.Printf("advertencia: %s=%q no es una duración positiva; se usa %s", key, raw, defaultValue)
	return defaultValue
}

// InstanceName identifica la réplica que atiende una petición o un trabajo.
// En las VM la fija el arranque con el nombre de la instancia (INSTANCE_NAME);
// dentro de un contenedor sin esa variable, el hostname es el id del contenedor,
// que sigue sirviendo para distinguir réplicas en local.
func InstanceName() string {
	if name := os.Getenv("INSTANCE_NAME"); name != "" {
		return name
	}
	if host, err := os.Hostname(); err == nil && host != "" {
		return host
	}
	return "unknown"
}

func GetPostgresDSN() string {
	// Construye el DSN (Data Source Name) para la conexión a PostgreSQL a partir de variables de entorno.
	host := GetEnv("POSTGRES_HOST", "localhost")
	port := GetEnv("POSTGRES_PORT", "5432")
	user := GetEnv("POSTGRES_USER", "postgres")
	password := GetEnv("POSTGRES_PASSWORD", "postgres")
	dbname := GetEnv("POSTGRES_DB", "mydb")
	sslmode := GetEnv("POSTGRES_SSLMODE", "disable")

	return "host=" + host + " user=" + user + " password=" + password + " dbname=" + dbname + " port=" + port + " sslmode=" + sslmode
}

func GetJWTSecret() string {
	// Obtiene el secreto para firmar los JWT desde la variable de entorno JWT_SECRET.
	// Si no está definida, usa un valor por defecto solo para desarrollo.
	return GetEnv("JWT_SECRET", "dev-jwt-secret-change-in-prod")
}

// RedisAddr y RedisPassword son la conexión a Redis que comparten go-redis (API)
// y asynq (API y worker): se leen una sola vez para que ambos no puedan divergir.
func RedisAddr() string {
	return GetEnv("REDIS_ADDR", "localhost:6379")
}

func RedisPassword() string {
	return GetEnv("REDIS_PASSWORD", "")
}

func GetSMTPConfig() (host, port, user string) {
	// Obtiene la configuración del servidor SMTP desde variables de entorno.
	host = GetEnv("SMTP_HOST", "mailpit")
	port = GetEnv("SMTP_PORT", "1025")
	user = GetEnv("SMTP_USER", "prueba@test.com")
	return host, port, user
}
