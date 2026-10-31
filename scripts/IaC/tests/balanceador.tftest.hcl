# Balanceador externo HTTPS: rutas, redirección de :80 y certificado.

mock_provider "google" {
  source = "./tests/mocks"
}
mock_provider "random" {}
mock_provider "tls" {}

variables {
  project_id = "proyecto-test"
  image_tag  = "abc123def456"
}

run "rutas" {
  command = plan

  assert {
    condition     = google_compute_backend_service.api.load_balancing_scheme == "EXTERNAL_MANAGED"
    error_message = "El balanceador es EXTERNAL_MANAGED"
  }

  assert {
    condition     = google_compute_backend_service.api.name == "mooc-api-backend"
    error_message = "El backend de la API se llama mooc-api-backend"
  }

  assert {
    condition     = toset(google_compute_url_map.https.path_matcher[0].path_rule[0].paths) == toset(["/api", "/api/*", "/health", "/openapi.json"])
    error_message = "/api, /health y /openapi.json van a la API"
  }

  assert {
    condition     = google_compute_url_map.http_redirect.default_url_redirect[0].https_redirect == true
    error_message = "El puerto 80 debe redirigir a HTTPS"
  }

  assert {
    condition     = google_compute_global_forwarding_rule.http.port_range == "80" && google_compute_global_forwarding_rule.https.port_range == "443"
    error_message = "Reglas de reenvío en 80 y 443"
  }
}

run "certificado_administrado_sslip" {
  command = apply

  assert {
    condition     = google_compute_managed_ssl_certificate.app[0].managed[0].domains[0] == "34.1.2.3.sslip.io"
    error_message = "Sin dominio, el certificado administrado es para <IP>.sslip.io"
  }

  assert {
    condition     = output.app_url == "https://34.1.2.3.sslip.io"
    error_message = "app_url usa el dominio sslip.io del balanceador"
  }

  assert {
    condition     = length(google_compute_ssl_certificate.self_signed) == 0
    error_message = "En modo managed no se sube certificado autofirmado"
  }
}

run "certificado_autofirmado" {
  command = apply

  variables {
    ssl_mode = "self_signed"
  }

  assert {
    condition     = length(google_compute_managed_ssl_certificate.app) == 0 && length(google_compute_ssl_certificate.self_signed) == 1
    error_message = "En modo self_signed se sube un certificado autofirmado y no se pide uno administrado"
  }

  assert {
    condition     = tls_self_signed_cert.self_signed[0].dns_names[0] == "34.1.2.3.sslip.io"
    error_message = "El autofirmado cubre el dominio sslip.io"
  }
}

run "dominio_propio" {
  command = apply

  variables {
    domain = "mooc.example.org"
  }

  assert {
    condition     = google_compute_managed_ssl_certificate.app[0].managed[0].domains[0] == "mooc.example.org"
    error_message = "Con dominio propio, el certificado es para ese dominio"
  }
}
