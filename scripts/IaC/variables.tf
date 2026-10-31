variable "project_id" {
  description = "ID del proyecto de Google Cloud donde se despliega la plataforma"
  type        = string
}

variable "region" {
  description = "Región de Google Cloud para red, cómputo, base de datos y almacenamiento"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Zona donde viven los grupos de instancias y la VM de la cola"
  type        = string
  default     = "us-central1-a"
}

variable "name_prefix" {
  description = "Prefijo para nombrar todos los recursos del despliegue"
  type        = string
  default     = "mooc"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix debe ser minúsculas (letras, dígitos o guiones) y comenzar con letra."
  }
}

# ---------------------------------------------------------------------------
# Imágenes
# ---------------------------------------------------------------------------

variable "image_tag" {
  description = <<-EOT
    Etiqueta de las imágenes api, worker y frontend en Artifact Registry. La
    imprime scripts/publish_images.sh. Las etiquetas son inmutables, así que
    cambiarla es la única forma de desplegar código nuevo: genera plantillas
    nuevas y los grupos las aplican con un reemplazo gradual.
  EOT
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Máquinas
# ---------------------------------------------------------------------------

variable "api_machine_type" {
  description = "Tipo de máquina de cada instancia del grupo de la API"
  type        = string
  default     = "e2-small"
}

variable "worker_machine_type" {
  description = "Tipo de máquina de cada instancia del grupo de workers"
  type        = string
  default     = "e2-small"
}

variable "frontend_machine_type" {
  description = "Tipo de máquina de la instancia del frontend"
  type        = string
  default     = "e2-small"
}

variable "queue_machine_type" {
  description = <<-EOT
    Tipo de máquina de mooc-queue, que corre Redis, ClamAV y Mailpit. ClamAV
    retiene casi 1 GB con la base de firmas cargada; en una de 2 GiB, junto a
    Redis, era el proceso que se llevaba el OOM killer en la entrega 2.
  EOT
  type        = string
  default     = "e2-medium"
}

variable "boot_disk_size_gb" {
  description = "Tamaño del disco de arranque persistente por máquina en GiB"
  type        = number
  default     = 30

  validation {
    condition     = var.boot_disk_size_gb >= 30
    error_message = "El enunciado exige al menos 30 GiB de almacenamiento persistente por VM."
  }
}

variable "boot_disk_type" {
  description = "Tipo de disco de arranque de las VM"
  type        = string
  default     = "pd-balanced"
}

variable "boot_image_project" {
  description = "Proyecto de la imagen de arranque"
  type        = string
  default     = "debian-cloud"
}

variable "boot_image_family" {
  description = "Familia de imagen de arranque (trae google-cloud-cli; Docker se instala al arrancar)"
  type        = string
  default     = "debian-12"
}

# ---------------------------------------------------------------------------
# Autoscaling
# ---------------------------------------------------------------------------

variable "api_min_replicas" {
  description = "Mínimo de instancias del grupo de la API"
  type        = number
  default     = 1
}

variable "api_max_replicas" {
  description = "Máximo de instancias del grupo de la API"
  type        = number
  default     = 3

  validation {
    condition     = var.api_max_replicas >= var.api_min_replicas && var.api_min_replicas >= 1
    error_message = "api_max_replicas debe ser mayor o igual que api_min_replicas, y el mínimo al menos 1."
  }
}

variable "api_cpu_target" {
  description = <<-EOT
    Utilización de CPU promedio del grupo de la API que el autoscaler intenta
    sostener. 0.6 deja margen para absorber un pico mientras arranca la
    instancia nueva, que tarda unos minutos en estar sirviendo.
  EOT
  type        = number
  default     = 0.6

  validation {
    condition     = var.api_cpu_target > 0 && var.api_cpu_target <= 1
    error_message = "api_cpu_target es una fracción entre 0 y 1."
  }
}

variable "worker_min_replicas" {
  description = "Mínimo de instancias del grupo de workers"
  type        = number
  default     = 1
}

variable "worker_max_replicas" {
  description = "Máximo de instancias del grupo de workers"
  type        = number
  default     = 3

  validation {
    condition     = var.worker_max_replicas >= var.worker_min_replicas && var.worker_min_replicas >= 1
    error_message = "worker_max_replicas debe ser mayor o igual que worker_min_replicas, y el mínimo al menos 1."
  }
}

variable "worker_concurrency" {
  description = <<-EOT
    Concurrencia de asynq en cada worker, es decir cuántos trabajos de media
    procesa a la vez. Sale de la entrega 2: cada ffmpeg transcodificando 1080p
    consume unos 102 MB y con 10 simultáneos la VM de 2 GiB entraba en OOM.
    También es la asignación por instancia del autoscaler: con backlog N, el
    grupo pide ceil(N / worker_concurrency) workers.
  EOT
  type        = number
  default     = 4
}

variable "autoscaler_cooldown_sec" {
  description = <<-EOT
    Periodo de inicialización de una instancia nueva: el autoscaler ignora sus
    métricas durante este tiempo. Se ajusta al tiempo de arranque medido
    (guest attribute mooc/ready-uptime-sec) para no escalar dos veces por el
    mismo pico.
  EOT
  type        = number
  default     = 180
}

variable "autohealing_initial_delay_sec" {
  description = "Tiempo que el autohealing espera antes de evaluar una instancia nueva"
  type        = number
  default     = 300
}

# ---------------------------------------------------------------------------
# Presupuesto de conexiones de Cloud SQL
# ---------------------------------------------------------------------------

variable "db_max_connections" {
  description = "max_connections del tier de Cloud SQL (db-f1-micro admite 25)"
  type        = number
  default     = 25
}

variable "api_db_max_open_conns" {
  description = "Tope del pool de PostgreSQL en cada réplica de la API (POSTGRES_MAX_OPEN_CONNS)"
  type        = number
  default     = 5
}

variable "worker_db_max_open_conns" {
  description = <<-EOT
    Tope del pool de PostgreSQL en cada réplica del worker. Las réplicas de API
    y worker, todas a la vez y en su máximo, tienen que caber en
    db_max_connections menos las reservadas de Cloud SQL; si no, la que arranca
    última recibe "too many clients" y no arranca.
  EOT
  type        = number
  default     = 2

  validation {
    condition = (
      var.api_max_replicas * var.api_db_max_open_conns +
      var.worker_max_replicas * var.worker_db_max_open_conns +
      3 <= var.db_max_connections
    )
    error_message = "Las conexiones de API y workers en su máximo, más 3 reservadas de Cloud SQL, superan db_max_connections."
  }
}

# ---------------------------------------------------------------------------
# Apagado ordenado
# ---------------------------------------------------------------------------

variable "api_shutdown_timeout_sec" {
  description = "Tiempo que la API espera a las peticiones en curso tras SIGTERM (API_SHUTDOWN_TIMEOUT)"
  type        = number
  default     = 25

  validation {
    condition     = var.api_shutdown_timeout_sec > 0 && var.api_shutdown_timeout_sec <= 80
    error_message = "Compute Engine da unos 90 s al script de apagado: el tope debe quedar por debajo de 80 s."
  }
}

variable "worker_shutdown_timeout_sec" {
  description = "Tiempo que asynq espera a los trabajos en curso tras SIGTERM (WORKER_SHUTDOWN_TIMEOUT)"
  type        = number
  default     = 60

  validation {
    condition     = var.worker_shutdown_timeout_sec > 0 && var.worker_shutdown_timeout_sec <= 80
    error_message = "Compute Engine da unos 90 s al script de apagado: el tope debe quedar por debajo de 80 s."
  }
}

# ---------------------------------------------------------------------------
# Balanceador
# ---------------------------------------------------------------------------

variable "ssl_mode" {
  description = <<-EOT
    Certificado del balanceador. "managed" pide un certificado administrado por
    Google para el dominio (sin dominio propio, <IP>.sslip.io, que resuelve a
    la IP del balanceador); tarda entre 15 y 60 minutos en quedar ACTIVE.
    "self_signed" sube un certificado autofirmado: funciona al instante, pero
    los clientes tienen que aceptarlo (curl -k).
  EOT
  type        = string
  default     = "managed"

  validation {
    condition     = contains(["managed", "self_signed"], var.ssl_mode)
    error_message = "ssl_mode debe ser \"managed\" o \"self_signed\"."
  }
}

variable "domain" {
  description = "Dominio público de la aplicación. Vacío usa <IP del balanceador>.sslip.io"
  type        = string
  default     = ""
}

variable "api_backend_timeout_sec" {
  description = <<-EOT
    Timeout del backend de la API en el balanceador. El valor por defecto de
    Google (30 s) corta un PATCH de TUS con un fragmento grande desde un
    enlace lento.
  EOT
  type        = number
  default     = 300
}

variable "deploy_frontend" {
  description = "Desplegar el frontend (SPA de React servida por nginx) en su grupo de tamaño fijo detrás del balanceador"
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# Telemetría
# ---------------------------------------------------------------------------

variable "install_ops_agent" {
  description = "Instalar el Ops Agent de Google Cloud en las VM para enviar métricas a Cloud Monitoring"
  type        = bool
  default     = true
}

variable "metrics_scrape_interval" {
  description = <<-EOT
    Intervalo de recolección de métricas: tanto el hostmetrics del Ops Agent
    como el scrape de /metrics. El valor por defecto del agente es 60s, demasiado
    grueso para separar una degradación de un pico. Más corto da más resolución
    y más muestras facturadas.
  EOT
  type        = string
  default     = "30s"

  validation {
    condition     = can(regex("^[0-9]+(ms|s|m)$", var.metrics_scrape_interval))
    error_message = "metrics_scrape_interval debe ser una duración de Prometheus, por ejemplo 15s, 30s o 1m."
  }
}

variable "queue_metrics_interval_sec" {
  description = "Cada cuántos segundos mooc-queue publica pending, active y backlog en Cloud Monitoring"
  type        = number
  default     = 30

  validation {
    condition     = var.queue_metrics_interval_sec >= 10
    error_message = "Cloud Monitoring no acepta más de un punto cada 5 s por serie; menos de 10 s no aporta."
  }
}

# ---------------------------------------------------------------------------
# Generador de carga
# ---------------------------------------------------------------------------

variable "deploy_loadgen" {
  description = <<-EOT
    Aprovisiona una máquina de pruebas, no de la aplicación, para ejecutar k6
    desde dentro de la región. El enunciado exige que el generador corra fuera
    de las máquinas de la aplicación y que se verifique que no limita los
    resultados. Apagado por defecto: sólo se enciende para las corridas de
    capacidad.
  EOT
  type        = bool
  default     = false
}

variable "loadgen_machine_type" {
  description = "Tipo de máquina del generador de carga. k6 no necesita mucho; el límite suele ser la red"
  type        = string
  default     = "e2-small"
}

variable "k6_version" {
  description = "Versión de k6 que se instala en el generador (etiqueta de release, con la v)"
  type        = string
  default     = "v2.3.0"
}

variable "task_version" {
  description = "Versión de go-task que se instala en el generador (etiqueta de release, con la v)"
  type        = string
  default     = "v3.53.1"
}

variable "repo_url" {
  description = "Repositorio que clona el generador de carga para tener los guiones de k6"
  type        = string
  default     = "https://github.com/DiegoMunevar2007/Proyecto-MOOC-Cloud.git"
}

variable "repo_branch" {
  description = "Rama que clona el generador de carga"
  type        = string
  default     = "main"
}

variable "app_dir" {
  description = "Directorio del clon en el generador de carga"
  type        = string
  default     = "/opt/mooc"
}

# ---------------------------------------------------------------------------
# Base de datos
# ---------------------------------------------------------------------------

variable "db_version" {
  description = "Versión de PostgreSQL del servicio administrado"
  type        = string
  default     = "POSTGRES_17"
}

variable "db_tier" {
  description = "Tier de la instancia administrada de PostgreSQL"
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_size_gb" {
  description = "Tamaño del disco de la instancia administrada en GiB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Nombre de la base de datos transaccional"
  type        = string
  default     = "mydb"
}

variable "db_user" {
  description = "Usuario administrador de la base de datos"
  type        = string
  default     = "postgres"
}

# ---------------------------------------------------------------------------
# Acceso
# ---------------------------------------------------------------------------

variable "authorized_ssh_ranges" {
  description = "Rangos CIDR autorizados para SSH (por defecto el rango de IAP)"
  type        = list(string)
  default     = ["35.235.240.0/20"]
}

variable "cors_origins" {
  description = "Orígenes permitidos por CORS en el bucket de objetos"
  type        = list(string)
  default     = ["*"]
}
