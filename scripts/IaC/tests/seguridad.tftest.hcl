# Red, identidades y plantillas: nada público salvo el balanceador, una cuenta
# de servicio por rol y solo los secretos que cada rol usa.

mock_provider "google" {
  source = "./tests/mocks"
}
mock_provider "random" {}
mock_provider "tls" {}

variables {
  project_id = "proyecto-test"
  image_tag  = "abc123def456"
}

run "plantillas_sin_ip_publica" {
  command = plan

  assert {
    condition = alltrue([
      for role, t in google_compute_instance_template.role : length(t.network_interface[0].access_config) == 0
    ])
    error_message = "Ninguna plantilla de instancia puede tener IP pública"
  }

  assert {
    condition     = length(google_compute_instance.queue.network_interface[0].access_config) == 0
    error_message = "mooc-queue no puede tener IP pública"
  }
}

run "scripts_comunes" {
  command = plan

  assert {
    condition = alltrue([
      for role, t in google_compute_instance_template.role :
      t.metadata["startup-script"] == file("${path.module}/scripts/startup.sh") &&
      t.metadata["shutdown-script"] == file("${path.module}/scripts/shutdown.sh") &&
      t.metadata["mooc-role"] == role &&
      t.metadata["enable-guest-attributes"] == "TRUE"
    ])
    error_message = "Todos los roles usan el mismo startup.sh y shutdown.sh, con su mooc-role y guest attributes"
  }

  assert {
    condition     = google_compute_instance.queue.metadata["startup-script"] == file("${path.module}/scripts/startup.sh") && google_compute_instance.queue.metadata["mooc-role"] == "queue"
    error_message = "mooc-queue usa el mismo startup.sh con rol queue"
  }

  assert {
    condition     = google_compute_instance_template.role["api"].metadata["mooc-image"] == "us-central1-docker.pkg.dev/proyecto-test/mooc-images/api:abc123def456"
    error_message = "La API corre la imagen de Artifact Registry con la etiqueta de image_tag"
  }
}

run "cola_fuera_de_los_grupos" {
  command = apply

  assert {
    condition     = google_compute_instance.queue.machine_type == "e2-medium"
    error_message = "mooc-queue es una e2-medium"
  }

  assert {
    condition     = google_compute_address.queue_internal.address == "10.10.1.30"
    error_message = "mooc-queue tiene la IP interna fija 10.10.1.30"
  }

  assert {
    condition     = strcontains(google_compute_instance_template.role["api"].metadata["mooc-env"], "REDIS_ADDR=10.10.1.30:6379")
    error_message = "La API usa el Redis de mooc-queue"
  }

  assert {
    condition     = strcontains(google_compute_instance_template.role["worker"].metadata["mooc-env"], "CLAMAV_HOST=10.10.1.30:3310")
    error_message = "Los workers usan el ClamAV de mooc-queue"
  }

  assert {
    condition     = google_compute_instance.queue.metadata["mooc-queue-metrics-script"] == file("${path.module}/scripts/queue_metrics.sh")
    error_message = "mooc-queue recibe el publicador de la métrica de la cola"
  }
}

run "firewall_por_rol" {
  command = plan

  assert {
    condition     = toset(google_compute_firewall.redis.source_tags) == toset(["api", "worker"]) && toset(google_compute_firewall.redis.target_tags) == toset(["queue"])
    error_message = "Solo API y workers alcanzan Redis"
  }

  assert {
    condition     = toset(google_compute_firewall.clamav.source_tags) == toset(["worker"])
    error_message = "Solo los workers alcanzan ClamAV"
  }

  assert {
    condition     = toset(google_compute_firewall.smtp.source_tags) == toset(["api"])
    error_message = "Solo la API alcanza el SMTP"
  }

  assert {
    condition = alltrue([
      for fw in [google_compute_firewall.iap_ssh, google_compute_firewall.lb_to_api, google_compute_firewall.hc_to_worker, google_compute_firewall.redis, google_compute_firewall.clamav, google_compute_firewall.smtp] :
      !contains(coalesce(fw.source_ranges, []), "0.0.0.0/0")
    ])
    error_message = "Ninguna regla abre puertos a 0.0.0.0/0: lo público es el balanceador"
  }
}

run "una_cuenta_por_rol" {
  command = plan

  assert {
    condition     = toset(keys(google_service_account.role)) == toset(["api", "worker", "frontend", "queue", "loadgen"])
    error_message = "Debe haber una cuenta de servicio por rol"
  }

  assert {
    condition = toset(keys(google_secret_manager_secret_iam_member.role)) == toset([
      "api/mooc-postgres-password", "api/mooc-redis-password", "api/mooc-jwt-secret",
      "api/mooc-api-s3-access-key", "api/mooc-api-s3-secret-key",
      "worker/mooc-postgres-password", "worker/mooc-redis-password",
      "worker/mooc-worker-s3-access-key", "worker/mooc-worker-s3-secret-key",
      "queue/mooc-redis-password",
    ])
    error_message = "Cada rol solo puede leer sus secretos: queue solo Redis, el frontend ninguno"
  }

  assert {
    condition     = toset(keys(google_storage_hmac_key.role)) == toset(["api", "worker"])
    error_message = "Solo API y workers tienen claves HMAC"
  }

  assert {
    condition     = toset(keys(google_artifact_registry_repository_iam_member.reader)) == toset(["api", "worker", "frontend"])
    error_message = "Solo los roles con imagen leen Artifact Registry"
  }
}

run "registro_inmutable" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.images.docker_config[0].immutable_tags == true
    error_message = "Las etiquetas del registro deben ser inmutables"
  }
}
