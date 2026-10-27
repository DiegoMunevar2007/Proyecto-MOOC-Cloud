# Red virtual privada, subred, reglas de firewall y salida a Internet.
#
# Ninguna VM tiene IP pública: lo único expuesto a Internet es el balanceador.
# Cada regla de firewall abre un puerto a un rol concreto, en vez de la regla
# "todo lo interno con todo" de la entrega 2: un worker no tiene por qué poder
# hablar con el puerto de la API, ni la API con ClamAV.

resource "google_compute_network" "main" {
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.enabled]
}

resource "google_compute_subnetwork" "app" {
  name                     = "${var.name_prefix}-app-subnet"
  ip_cidr_range            = local.app_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true
}

# IP interna fija de mooc-queue: API y workers la reciben por configuración.
resource "google_compute_address" "queue_internal" {
  name         = "${var.name_prefix}-queue-internal-ip"
  address_type = "INTERNAL"
  address      = local.queue_internal_ip
  region       = var.region
  subnetwork   = google_compute_subnetwork.app.id
}

# Salida a Internet de las VM sin IP pública (apt, Docker Hub, Artifact
# Registry por su dominio público).
resource "google_compute_router" "main" {
  name    = "${var.name_prefix}-router"
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.name_prefix}-nat"
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# SSH solo por Identity-Aware Proxy (no se abre el puerto 22 a Internet).
resource "google_compute_firewall" "iap_ssh" {
  name          = "${var.name_prefix}-allow-iap-ssh"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = var.authorized_ssh_ranges
  target_tags   = [local.common_tag]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# Balanceador y health checks -> API. El tráfico de los proxies del balanceador
# externo y el de los health checks sale de los mismos rangos de Google.
resource "google_compute_firewall" "lb_to_api" {
  name          = "${var.name_prefix}-allow-lb-api"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = local.google_lb_ranges
  target_tags   = [local.api_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(local.api_port)]
  }
}

# Balanceador y health checks -> frontend.
resource "google_compute_firewall" "lb_to_frontend" {
  count = var.deploy_frontend ? 1 : 0

  name          = "${var.name_prefix}-allow-lb-frontend"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = local.google_lb_ranges
  target_tags   = [local.frontend_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(local.frontend_port)]
  }
}

# Autohealing del worker: el health check consulta su /metrics. El worker no
# recibe tráfico de nadie más; toma su trabajo de Redis.
resource "google_compute_firewall" "hc_to_worker" {
  name          = "${var.name_prefix}-allow-hc-worker"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = local.google_lb_ranges
  target_tags   = [local.worker_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(local.worker_port)]
  }
}

# API y workers -> Redis (cola asynq, sesiones y locks de TUS).
resource "google_compute_firewall" "redis" {
  name        = "${var.name_prefix}-allow-redis"
  network     = google_compute_network.main.name
  direction   = "INGRESS"
  priority    = 1000
  source_tags = [local.api_tag, local.worker_tag]
  target_tags = [local.queue_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(local.redis_port)]
  }
}

# Workers -> ClamAV.
resource "google_compute_firewall" "clamav" {
  name        = "${var.name_prefix}-allow-clamav"
  network     = google_compute_network.main.name
  direction   = "INGRESS"
  priority    = 1000
  source_tags = [local.worker_tag]
  target_tags = [local.queue_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(local.clamav_port)]
  }
}

# API -> Mailpit (SMTP de pruebas; la UI queda en loopback de mooc-queue).
resource "google_compute_firewall" "smtp" {
  name        = "${var.name_prefix}-allow-smtp"
  network     = google_compute_network.main.name
  direction   = "INGRESS"
  priority    = 1000
  source_tags = [local.api_tag]
  target_tags = [local.queue_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(local.smtp_port)]
  }
}

# Acceso privado a servicios administrados (Cloud SQL) vía Private Service Access.
resource "google_compute_global_address" "psa" {
  name          = "${var.name_prefix}-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa.name]
  deletion_policy         = "REMOVE_PEERING"

  depends_on = [google_project_service.enabled]
}
