locals {
  required_apis = toset([
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iap.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
  ])

  # Una cuenta de servicio por rol. En la entrega 2 había una sola para todo,
  # y eso daba a mooc-queue acceso al secreto del JWT y a las claves de los
  # buckets, que no usa.
  roles = {
    api      = "MOOC API"
    worker   = "MOOC workers"
    frontend = "MOOC frontend"
    queue    = "MOOC cola (Redis, ClamAV, Mailpit)"
    loadgen  = "MOOC generador de carga"
  }

  # Todas escriben logs y métricas (Ops Agent; mooc-queue publica la métrica
  # de la cola con su propia cuenta).
  role_project_bindings = merge([
    for role in keys(local.roles) : {
      for project_role in ["roles/logging.logWriter", "roles/monitoring.metricWriter"] :
      "${role}/${project_role}" => { role = role, project_role = project_role }
    }
  ]...)
}

resource "google_project_service" "enabled" {
  for_each = local.required_apis

  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "role" {
  for_each = local.roles

  account_id   = "${var.name_prefix}-${each.key}"
  display_name = each.value

  depends_on = [google_project_service.enabled]
}

resource "google_project_iam_member" "role" {
  for_each = local.role_project_bindings

  project = var.project_id
  role    = each.value.project_role
  member  = google_service_account.role[each.value.role].member
}

# ---------------------------------------------------------------------------
# Secretos generados en el despliegue (nunca en el repositorio).
# ---------------------------------------------------------------------------

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = true
}

resource "random_password" "redis" {
  length  = 32
  special = false
}

locals {
  secret_values = {
    (local.secret_postgres_password) = random_password.postgres.result
    (local.secret_jwt)               = random_password.jwt.result
    (local.secret_redis_password)    = random_password.redis.result
    (local.secret_api_s3_access)     = google_storage_hmac_key.role["api"].access_id
    (local.secret_api_s3_secret)     = google_storage_hmac_key.role["api"].secret
    (local.secret_worker_s3_access)  = google_storage_hmac_key.role["worker"].access_id
    (local.secret_worker_s3_secret)  = google_storage_hmac_key.role["worker"].secret
  }

  # Qué secretos lee cada rol: exactamente los que aparecen en su mooc-secrets.
  # El frontend y el generador de carga no leen ninguno.
  role_secrets = {
    api    = values(local.api_secrets)
    worker = values(local.worker_secrets)
    queue  = values(local.queue_secrets)
  }

  secret_access = merge([
    for role, secrets in local.role_secrets : {
      for secret in secrets : "${role}/${secret}" => { role = role, secret = secret }
    }
  ]...)
}

resource "google_secret_manager_secret" "app" {
  for_each = toset(keys(local.secret_values))

  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "app" {
  for_each = toset(keys(local.secret_values))

  secret      = google_secret_manager_secret.app[each.value].id
  secret_data = local.secret_values[each.value]
}

resource "google_secret_manager_secret_iam_member" "role" {
  for_each = local.secret_access

  project   = var.project_id
  secret_id = google_secret_manager_secret.app[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.role[each.value.role].member
}
