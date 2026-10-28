locals {
  labels = {
    project     = var.name_prefix
    environment = "entrega3"
    managed_by  = "terraform"
  }

  # Red
  app_subnet_cidr = "10.10.1.0/24"

  # mooc-queue tiene IP fija: API y workers la reciben por configuración, y una
  # IP que cambiara al recrear la VM los dejaría apuntando a la nada.
  queue_internal_ip = "10.10.1.30"

  # Rangos desde los que llegan los health checks de Google y los proxies del
  # balanceador externo (GFE).
  google_lb_ranges = ["130.211.0.0/22", "35.191.0.0/16"]

  # Etiquetas de red: una por rol, para que cada regla de firewall abra solo lo
  # que ese rol necesita. common_tag es la del SSH por IAP.
  api_tag      = "api"
  worker_tag   = "worker"
  frontend_tag = "frontend"
  queue_tag    = "queue"
  loadgen_tag  = "loadgen"
  common_tag   = "app"

  # Puertos de los servicios
  api_port      = 8080
  worker_port   = 9101 # /metrics del worker: autohealing y Ops Agent
  frontend_port = 3000
  redis_port    = 6379
  clamav_port   = 3310
  smtp_port     = 1025

  # Dominio público: con dominio propio, ese; si no, sslip.io, que resuelve
  # <IP>.sslip.io a la IP y permite un certificado administrado sin DNS propio.
  lb_domain = var.domain != "" ? var.domain : "${google_compute_global_address.lb.address}.sslip.io"
  app_url   = "https://${local.lb_domain}"

  # Imágenes publicadas por scripts/publish_images.sh.
  registry_host = "${var.region}-docker.pkg.dev"
  image_repo    = "${local.registry_host}/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  images = {
    api      = "${local.image_repo}/api:${var.image_tag}"
    worker   = "${local.image_repo}/worker:${var.image_tag}"
    frontend = "${local.image_repo}/frontend:${var.image_tag}"
  }

  # Nombres de secretos. Las claves HMAC son por rol: cada cuenta de servicio
  # firma con sus propias credenciales y solo puede leer las suyas.
  secret_postgres_password = "${var.name_prefix}-postgres-password"
  secret_jwt               = "${var.name_prefix}-jwt-secret"
  secret_redis_password    = "${var.name_prefix}-redis-password"
  secret_api_s3_access     = "${var.name_prefix}-api-s3-access-key"
  secret_api_s3_secret     = "${var.name_prefix}-api-s3-secret-key"
  secret_worker_s3_access  = "${var.name_prefix}-worker-s3-access-key"
  secret_worker_s3_secret  = "${var.name_prefix}-worker-s3-secret-key"

  # Buckets con sufijo aleatorio: los nombres de Cloud Storage son globales.
  bucket_originals = "${var.name_prefix}-${random_id.bucket_suffix.hex}-originals"
  bucket_hls       = "${var.name_prefix}-${random_id.bucket_suffix.hex}-hls"
  bucket_public    = "${var.name_prefix}-${random_id.bucket_suffix.hex}-public"

  # ---------------------------------------------------------------------------
  # Configuración de los contenedores
  #
  # Cada rol recibe por metadatos su entorno sin secretos (mooc-env) y la lista
  # de secretos que debe resolver (mooc-secrets, VARIABLE=nombre-del-secreto).
  # startup.sh es el mismo para todos: escribe el .env, resuelve los secretos
  # con la cuenta de servicio de la VM y arranca el contenedor.
  # ---------------------------------------------------------------------------
  postgres_env = {
    POSTGRES_HOST    = google_sql_database_instance.postgres.private_ip_address
    POSTGRES_PORT    = "5432"
    POSTGRES_USER    = google_sql_user.app.name
    POSTGRES_DB      = google_sql_database.app.name
    POSTGRES_SSLMODE = "disable"
  }

  storage_env = {
    S3_ENDPOINT         = "storage.googleapis.com"
    S3_PUBLIC_ENDPOINT  = "https://storage.googleapis.com"
    S3_USE_SSL          = "true"
    S3_REGION           = "auto"
    S3_BUCKET_ORIGINALS = google_storage_bucket.originals.name
    S3_BUCKET_HLS       = google_storage_bucket.hls.name
    S3_BUCKET_PUBLIC    = google_storage_bucket.public.name
    CDN_BASE_URL        = ""
  }

  api_env = merge(local.postgres_env, local.storage_env, {
    POSTGRES_MAX_OPEN_CONNS = tostring(var.api_db_max_open_conns)
    REDIS_ADDR              = "${local.queue_internal_ip}:${local.redis_port}"
    SMTP_HOST               = local.queue_internal_ip
    SMTP_PORT               = tostring(local.smtp_port)
    SMTP_USER               = "prueba@test.com"
    API_SHUTDOWN_TIMEOUT    = "${var.api_shutdown_timeout_sec}s"
    GIN_MODE                = "release"
  })

  worker_env = merge(local.postgres_env, local.storage_env, {
    POSTGRES_MAX_OPEN_CONNS = tostring(var.worker_db_max_open_conns)
    REDIS_ADDR              = "${local.queue_internal_ip}:${local.redis_port}"
    CLAMAV_HOST             = "${local.queue_internal_ip}:${local.clamav_port}"
    WORKER_CONCURRENCY      = tostring(var.worker_concurrency)
    WORKER_SHUTDOWN_TIMEOUT = "${var.worker_shutdown_timeout_sec}s"
    METRICS_ADDR            = ":${local.worker_port}"
  })

  # El frontend es estático (nginx escucha en 3000 por su configuración): no
  # recibe entorno ni secretos.
  frontend_env = {}

  api_secrets = {
    POSTGRES_PASSWORD = local.secret_postgres_password
    REDIS_PASSWORD    = local.secret_redis_password
    JWT_SECRET        = local.secret_jwt
    S3_ACCESS_KEY     = local.secret_api_s3_access
    S3_SECRET_KEY     = local.secret_api_s3_secret
  }

  worker_secrets = {
    POSTGRES_PASSWORD = local.secret_postgres_password
    REDIS_PASSWORD    = local.secret_redis_password
    S3_ACCESS_KEY     = local.secret_worker_s3_access
    S3_SECRET_KEY     = local.secret_worker_s3_secret
  }

  queue_secrets = {
    REDIS_PASSWORD = local.secret_redis_password
  }

  # Metadatos comunes a todas las VM de la aplicación.
  common_metadata = {
    "startup-script"               = file("${path.module}/scripts/startup.sh")
    "shutdown-script"              = file("${path.module}/scripts/shutdown.sh")
    "enable-guest-attributes"      = "TRUE"
    "mooc-project-id"              = var.project_id
    "mooc-registry-host"           = local.registry_host
    "mooc-install-ops-agent"       = tostring(var.install_ops_agent)
    "mooc-ops-agent-script"        = file("${path.module}/scripts/install_ops_agent.sh")
    "mooc-metrics-scrape-interval" = var.metrics_scrape_interval
  }
}
