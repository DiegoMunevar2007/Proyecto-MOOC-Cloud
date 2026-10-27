data "google_compute_image" "boot" {
  project = var.boot_image_project
  family  = var.boot_image_family
}

locals {
  # Lo que distingue a cada rol de grupo. Todo lo demás (disco, red sin IP
  # pública, scripts de arranque y apagado) es igual para los tres.
  group_roles = merge(
    {
      api = {
        machine_type = var.api_machine_type
        tags         = [local.api_tag, local.common_tag]
        metadata = {
          "mooc-image"          = local.images.api
          "mooc-port"           = tostring(local.api_port)
          "mooc-ready-path"     = "/health"
          "mooc-stop-timeout"   = tostring(var.api_shutdown_timeout_sec + 5)
          "mooc-wait-for"       = "${local.queue_internal_ip}:${local.redis_port}"
          "mooc-metrics-target" = "127.0.0.1:${local.api_port}"
          "mooc-env"            = join("\n", [for k, v in local.api_env : "${k}=${v}"])
          "mooc-secrets"        = join("\n", [for k, v in local.api_secrets : "${k}=${v}"])
        }
      }
      worker = {
        machine_type = var.worker_machine_type
        tags         = [local.worker_tag, local.common_tag]
        metadata = {
          "mooc-image"          = local.images.worker
          "mooc-port"           = tostring(local.worker_port)
          "mooc-ready-path"     = "/metrics"
          "mooc-stop-timeout"   = tostring(var.worker_shutdown_timeout_sec + 5)
          "mooc-wait-for"       = "${local.queue_internal_ip}:${local.redis_port}"
          "mooc-metrics-target" = "127.0.0.1:${local.worker_port}"
          "mooc-env"            = join("\n", [for k, v in local.worker_env : "${k}=${v}"])
          "mooc-secrets"        = join("\n", [for k, v in local.worker_secrets : "${k}=${v}"])
        }
      }
    },
    var.deploy_frontend ? {
      frontend = {
        machine_type = var.frontend_machine_type
        tags         = [local.frontend_tag, local.common_tag]
        metadata = {
          "mooc-image"          = local.images.frontend
          "mooc-port"           = tostring(local.frontend_port)
          "mooc-ready-path"     = "/"
          "mooc-stop-timeout"   = "10"
          "mooc-wait-for"       = ""
          "mooc-metrics-target" = ""
          "mooc-env"            = join("\n", [for k, v in local.frontend_env : "${k}=${v}"])
          "mooc-secrets"        = ""
        }
      }
    } : {}
  )
}

# ---------------------------------------------------------------------------
# Plantillas de instancia
#
# Sin IP pública: la salida a Internet va por Cloud NAT y la entrada solo por el
# balanceador (o IAP para SSH). Un cambio de image_tag o de configuración crea
# una plantilla nueva (name_prefix + create_before_destroy) y el grupo la
# aplica con su política de actualización.
# ---------------------------------------------------------------------------
resource "google_compute_instance_template" "role" {
  for_each = local.group_roles

  name_prefix  = "${var.name_prefix}-${each.key}-"
  machine_type = each.value.machine_type
  tags         = each.value.tags
  labels       = merge(local.labels, { role = each.key })

  disk {
    source_image = data.google_compute_image.boot.self_link
    disk_size_gb = var.boot_disk_size_gb
    disk_type    = var.boot_disk_type
    boot         = true
    auto_delete  = true
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id
    # Sin access_config: sin IP pública.
  }

  service_account {
    email  = google_service_account.role[each.key].email
    scopes = ["cloud-platform"]
  }

  metadata = merge(local.common_metadata, each.value.metadata, {
    "mooc-role" = each.key
  })

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
  }

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.image_tag != ""
      error_message = "Falta image_tag: publica las imágenes con scripts/publish_images.sh y pon la etiqueta que imprime en terraform.tfvars."
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_version.app,
    google_secret_manager_secret_iam_member.role,
    google_artifact_registry_repository_iam_member.reader,
  ]
}

# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

# Autohealing de la API: TCP al puerto. Es a propósito más laxo que el del
# balanceador (/health, que consulta PostgreSQL y Redis): si Redis cae, sacar la
# API del balanceador es correcto, pero recrear todas las VM no arreglaría nada.
resource "google_compute_health_check" "api_autohealing" {
  name                = "${var.name_prefix}-api-autohealing"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  tcp_health_check {
    port = local.api_port
  }
}

# Servicio de la API detrás del balanceador.
resource "google_compute_health_check" "api_lb" {
  name                = "${var.name_prefix}-api-lb"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = local.api_port
    request_path = "/health"
  }
}

# Autohealing del worker: su /metrics responde mientras el proceso vive.
resource "google_compute_health_check" "worker_autohealing" {
  name                = "${var.name_prefix}-worker-autohealing"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = local.worker_port
    request_path = "/metrics"
  }
}

# Frontend: el mismo chequeo para autohealing y balanceador.
resource "google_compute_health_check" "frontend" {
  count = var.deploy_frontend ? 1 : 0

  name                = "${var.name_prefix}-frontend"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = local.frontend_port
    request_path = "/"
  }
}

locals {
  autohealing_checks = merge(
    {
      api    = google_compute_health_check.api_autohealing.id
      worker = google_compute_health_check.worker_autohealing.id
    },
    var.deploy_frontend ? { frontend = google_compute_health_check.frontend[0].id } : {}
  )

  named_ports = {
    api      = local.api_port
    worker   = local.worker_port
    frontend = local.frontend_port
  }
}

# ---------------------------------------------------------------------------
# Grupos de instancias administrados
#
# API y workers son grupos independientes, cada uno con su autoscaler. El
# frontend es un grupo de tamaño fijo 1: no es parte de lo que se escala, pero
# así hereda el autohealing y el reemplazo gradual al cambiar la imagen.
# ---------------------------------------------------------------------------
resource "google_compute_instance_group_manager" "role" {
  for_each = local.group_roles

  name               = "${var.name_prefix}-${each.key}-mig"
  base_instance_name = "${var.name_prefix}-${each.key}"
  zone               = var.zone

  version {
    instance_template = google_compute_instance_template.role[each.key].self_link_unique
  }

  # API y workers los dimensiona su autoscaler; fijar target_size aquí haría
  # que cada apply peleara con él.
  target_size = each.key == "frontend" ? 1 : null

  named_port {
    name = "http"
    port = local.named_ports[each.key]
  }

  auto_healing_policies {
    health_check      = local.autohealing_checks[each.key]
    initial_delay_sec = var.autohealing_initial_delay_sec
  }

  # Una plantilla nueva se aplica creando primero la instancia nueva y retirando
  # la vieja cuando aquella ya existe: el grupo nunca baja de su tamaño.
  update_policy {
    type                  = "PROACTIVE"
    minimal_action        = "REPLACE"
    replacement_method    = "SUBSTITUTE"
    max_surge_fixed       = 1
    max_unavailable_fixed = 0
  }

  # La cola tiene que existir antes que sus consumidores. Que arranque no se
  # puede esperar desde aquí: lo espera startup.sh (mooc-wait-for).
  depends_on = [google_compute_instance.queue]
}

# API: escala por CPU promedio del grupo.
resource "google_compute_autoscaler" "api" {
  name   = "${var.name_prefix}-api-autoscaler"
  zone   = var.zone
  target = google_compute_instance_group_manager.role["api"].id

  autoscaling_policy {
    min_replicas    = var.api_min_replicas
    max_replicas    = var.api_max_replicas
    cooldown_period = var.autoscaler_cooldown_sec

    cpu_utilization {
      target = var.api_cpu_target
    }
  }
}

# Workers: escalan por el backlog de la cola, no por CPU. La CPU de un worker
# llega al 100 % con un solo ffmpeg y no dice cuánto trabajo falta; el backlog
# (pendientes + activos) sí. Es una métrica de grupo (resource.type global, la
# publica mooc-queue), y con single_instance_assignment el autoscaler pide
# ceil(backlog / worker_concurrency) instancias: cada worker atiende
# worker_concurrency trabajos a la vez.
resource "google_compute_autoscaler" "worker" {
  name   = "${var.name_prefix}-worker-autoscaler"
  zone   = var.zone
  target = google_compute_instance_group_manager.role["worker"].id

  autoscaling_policy {
    min_replicas    = var.worker_min_replicas
    max_replicas    = var.worker_max_replicas
    cooldown_period = var.autoscaler_cooldown_sec

    metric {
      name                       = google_monitoring_metric_descriptor.queue["backlog"].type
      filter                     = "resource.type = \"global\" AND metric.labels.queue = \"media\""
      single_instance_assignment = var.worker_concurrency
    }

    # Al vaciarse la cola no se retira más de un worker cada 10 minutos: una
    # tanda de subidas suele llegar por oleadas, y un worker retirado en medio
    # tarda minutos en volver.
    scale_in_control {
      max_scaled_in_replicas {
        fixed = 1
      }
      time_window_sec = 600
    }
  }
}

# ---------------------------------------------------------------------------
# mooc-queue: Redis (asynq), ClamAV y Mailpit
#
# Fuera de los grupos a propósito: es el estado compartido entre todas las
# réplicas. Si escalara con la API, cada réplica tendría su propia cola.
# ---------------------------------------------------------------------------
resource "google_compute_instance" "queue" {
  name         = "${var.name_prefix}-queue"
  machine_type = var.queue_machine_type
  zone         = var.zone
  tags         = [local.queue_tag, local.common_tag]
  labels       = merge(local.labels, { role = "queue" })

  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = data.google_compute_image.boot.self_link
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id
    network_ip = google_compute_address.queue_internal.address
    # Sin access_config: sin IP pública.
  }

  service_account {
    email  = google_service_account.role["queue"].email
    scopes = ["cloud-platform"]
  }

  metadata = merge(local.common_metadata, {
    "mooc-role"                  = "queue"
    "mooc-secrets"               = join("\n", [for k, v in local.queue_secrets : "${k}=${v}"])
    "mooc-metrics-target"        = ""
    "mooc-queue-metrics-script"  = file("${path.module}/scripts/queue_metrics.sh")
    "mooc-queue-metrics-seconds" = tostring(var.queue_metrics_interval_sec)
  })

  depends_on = [
    google_project_service.enabled,
    google_compute_router_nat.main,
    google_secret_manager_secret_version.app,
    google_secret_manager_secret_iam_member.role,
    google_project_iam_member.role,
    google_monitoring_metric_descriptor.queue,
  ]
}

# ---------------------------------------------------------------------------
# Generador de carga
#
# No forma parte de la aplicación: es la máquina de pruebas desde la que se
# ejecuta k6. Sin IP pública, se administra por IAP SSH y sale a Internet por
# Cloud NAT, que es por donde llega al balanceador como cualquier cliente.
# ---------------------------------------------------------------------------
resource "google_compute_instance" "loadgen" {
  count = var.deploy_loadgen ? 1 : 0

  name         = "${var.name_prefix}-loadgen"
  machine_type = var.loadgen_machine_type
  zone         = var.zone
  tags         = [local.loadgen_tag, local.common_tag]
  labels       = merge(local.labels, { role = "loadgen" })

  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = data.google_compute_image.boot.self_link
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id
  }

  service_account {
    email  = google_service_account.role["loadgen"].email
    scopes = ["cloud-platform"]
  }

  metadata = {
    "mooc-role"         = "loadgen"
    "mooc-app-dir"      = var.app_dir
    "mooc-repo-url"     = var.repo_url
    "mooc-repo-branch"  = var.repo_branch
    "mooc-k6-version"   = var.k6_version
    "mooc-task-version" = var.task_version
    "mooc-target-url"   = local.app_url
  }

  metadata_startup_script = file("${path.module}/scripts/loadgen_startup.sh")

  depends_on = [
    google_project_service.enabled,
    google_compute_router_nat.main,
  ]
}
