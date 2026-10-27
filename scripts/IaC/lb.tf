# Balanceador de aplicaciones externo global (EXTERNAL_MANAGED).
#
# Es el único punto público del despliegue. Termina TLS y reparte:
#   /api/*, /health, /openapi.json -> grupo de la API
#   todo lo demás                  -> grupo del frontend (o la API si no hay)
# El puerto 80 solo redirige a HTTPS.
#
# /metrics no está en la lista a propósito: va al frontend, que responde 404.
# Las métricas se leen en la VM (Ops Agent), no desde Internet.

resource "google_compute_global_address" "lb" {
  name = "${var.name_prefix}-lb-ip"

  depends_on = [google_project_service.enabled]
}

resource "google_compute_backend_service" "api" {
  name                            = "${var.name_prefix}-api-backend"
  load_balancing_scheme           = "EXTERNAL_MANAGED"
  protocol                        = "HTTP"
  port_name                       = "http"
  timeout_sec                     = var.api_backend_timeout_sec
  connection_draining_timeout_sec = var.api_shutdown_timeout_sec
  health_checks                   = [google_compute_health_check.api_lb.id]

  backend {
    group           = google_compute_instance_group_manager.role["api"].instance_group
    balancing_mode  = "UTILIZATION"
    max_utilization = 0.8
    capacity_scaler = 1.0
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_backend_service" "frontend" {
  count = var.deploy_frontend ? 1 : 0

  name                  = "${var.name_prefix}-frontend-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  health_checks         = [google_compute_health_check.frontend[0].id]

  backend {
    group           = google_compute_instance_group_manager.role["frontend"].instance_group
    balancing_mode  = "UTILIZATION"
    max_utilization = 0.8
    capacity_scaler = 1.0
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

locals {
  default_backend = var.deploy_frontend ? google_compute_backend_service.frontend[0].id : google_compute_backend_service.api.id

  # Rutas de la API. /api y /api/* son dos patrones porque el del balanceador
  # no casa el prefijo sin la barra final.
  api_paths = ["/api", "/api/*", "/health", "/openapi.json"]
}

resource "google_compute_url_map" "https" {
  name            = "${var.name_prefix}-https"
  default_service = local.default_backend

  host_rule {
    hosts        = ["*"]
    path_matcher = "app"
  }

  path_matcher {
    name            = "app"
    default_service = local.default_backend

    path_rule {
      paths   = local.api_paths
      service = google_compute_backend_service.api.id
    }
  }
}

# ---------------------------------------------------------------------------
# Certificado
# ---------------------------------------------------------------------------

# Administrado por Google. Se emite cuando el dominio resuelve a la IP del
# balanceador y la regla del 443 está activa; mientras tanto queda en
# PROVISIONING (15 a 60 minutos) y las conexiones HTTPS fallan.
resource "google_compute_managed_ssl_certificate" "app" {
  count = var.ssl_mode == "managed" ? 1 : 0

  name = "${var.name_prefix}-managed-cert"

  managed {
    domains = [local.lb_domain]
  }
}

# Autofirmado: sirve desde el primer minuto, a cambio de que los clientes lo
# acepten a mano (curl -k, k6 con INSECURE_TLS=true).
resource "tls_private_key" "self_signed" {
  count = var.ssl_mode == "self_signed" ? 1 : 0

  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "self_signed" {
  count = var.ssl_mode == "self_signed" ? 1 : 0

  private_key_pem       = tls_private_key.self_signed[0].private_key_pem
  validity_period_hours = 24 * 90
  dns_names             = [local.lb_domain]
  ip_addresses          = [google_compute_global_address.lb.address]

  subject {
    common_name  = local.lb_domain
    organization = "MOOC ISIS4426"
  }

  allowed_uses = ["key_encipherment", "digital_signature", "server_auth"]
}

resource "google_compute_ssl_certificate" "self_signed" {
  count = var.ssl_mode == "self_signed" ? 1 : 0

  name_prefix = "${var.name_prefix}-selfsigned-"
  private_key = tls_private_key.self_signed[0].private_key_pem
  certificate = tls_self_signed_cert.self_signed[0].cert_pem

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  ssl_certificate = (
    var.ssl_mode == "managed"
    ? google_compute_managed_ssl_certificate.app[0].id
    : google_compute_ssl_certificate.self_signed[0].id
  )
}

# ---------------------------------------------------------------------------
# HTTPS (443)
# ---------------------------------------------------------------------------

resource "google_compute_target_https_proxy" "app" {
  name             = "${var.name_prefix}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [local.ssl_certificate]
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${var.name_prefix}-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  ip_address            = google_compute_global_address.lb.id
  port_range            = "443"
  target                = google_compute_target_https_proxy.app.id
}

# ---------------------------------------------------------------------------
# HTTP (80) -> HTTPS
# ---------------------------------------------------------------------------

resource "google_compute_url_map" "http_redirect" {
  name = "${var.name_prefix}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "${var.name_prefix}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${var.name_prefix}-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  ip_address            = google_compute_global_address.lb.id
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
}
