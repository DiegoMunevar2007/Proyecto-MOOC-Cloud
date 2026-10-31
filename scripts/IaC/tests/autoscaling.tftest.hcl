# Pruebas del despliegue elástico sin tocar GCP: los proveedores son mocks, así
# que corren sin credenciales (terraform test). Fijan las decisiones de diseño
# de la entrega 3, no el comportamiento de Google.

mock_provider "google" {
  source = "./tests/mocks"
}
mock_provider "random" {}
mock_provider "tls" {}

variables {
  project_id = "proyecto-test"
  image_tag  = "abc123def456"
}

run "api_escala_por_cpu" {
  command = plan

  assert {
    condition     = google_compute_autoscaler.api.autoscaling_policy[0].min_replicas == 1
    error_message = "El grupo de la API debe tener mínimo 1 instancia"
  }

  assert {
    condition     = google_compute_autoscaler.api.autoscaling_policy[0].max_replicas == 3
    error_message = "El grupo de la API debe tener máximo 3 instancias"
  }

  assert {
    condition     = google_compute_autoscaler.api.autoscaling_policy[0].cpu_utilization[0].target == 0.6
    error_message = "La API debe escalar con objetivo de CPU 0.6"
  }


  assert {
    condition     = google_compute_health_check.api_autohealing.tcp_health_check[0].port == 8080
    error_message = "El autohealing de la API es TCP al 8080"
  }
}

run "workers_escalan_por_backlog" {
  command = plan

  assert {
    condition     = google_compute_autoscaler.worker.autoscaling_policy[0].metric[0].name == "custom.googleapis.com/mooc/queue/backlog"
    error_message = "Los workers deben escalar por la métrica de backlog de la cola"
  }

  assert {
    condition     = google_compute_autoscaler.worker.autoscaling_policy[0].metric[0].filter == "resource.type = \"global\" AND metric.labels.queue = \"media\""
    error_message = "El filtro debe seleccionar la serie global de la cola media (métrica de grupo)"
  }

  assert {
    condition     = google_compute_autoscaler.worker.autoscaling_policy[0].metric[0].single_instance_assignment == 4
    error_message = "Cada worker atiende 4 trabajos: single_instance_assignment debe ser 4"
  }

  assert {
    condition     = length(google_compute_autoscaler.worker.autoscaling_policy[0].cpu_utilization) == 0
    error_message = "Los workers no deben escalar por CPU"
  }

  assert {
    condition = (
      google_compute_autoscaler.worker.autoscaling_policy[0].min_replicas == 1 &&
      google_compute_autoscaler.worker.autoscaling_policy[0].max_replicas == 3
    )
    error_message = "El grupo de workers escala entre 1 y 3"
  }

  assert {
    condition     = google_compute_health_check.worker_autohealing.http_health_check[0].port == 9101 && google_compute_health_check.worker_autohealing.http_health_check[0].request_path == "/metrics"
    error_message = "El autohealing del worker es HTTP a :9101/metrics"
  }

  assert {
    condition     = google_monitoring_metric_descriptor.queue["backlog"].metric_kind == "GAUGE"
    error_message = "El backlog debe ser un GAUGE para que el autoscaler lo acepte"
  }

}

run "concurrencia_igual_a_asignacion" {
  command = apply

  assert {
    condition     = strcontains(google_compute_instance_template.role["worker"].metadata["mooc-env"], "WORKER_CONCURRENCY=4")
    error_message = "La concurrencia del worker debe coincidir con la asignación del autoscaler"
  }

  assert {
    condition = (
      strcontains(google_compute_instance_template.role["api"].metadata["mooc-env"], "POSTGRES_MAX_OPEN_CONNS=5") &&
      strcontains(google_compute_instance_template.role["worker"].metadata["mooc-env"], "POSTGRES_MAX_OPEN_CONNS=2")
    )
    error_message = "Cada rol recibe su tope de pool de PostgreSQL"
  }
}

run "frontend_tamano_fijo" {
  command = plan

  assert {
    condition     = google_compute_instance_group_manager.role["frontend"].target_size == 1
    error_message = "El frontend es un grupo de tamaño fijo 1"
  }

  assert {
    condition     = toset(keys(google_compute_instance_group_manager.role)) == toset(["api", "worker", "frontend"])
    error_message = "Hay un grupo por rol: api, worker y frontend"
  }
}

run "sin_frontend" {
  command = plan

  variables {
    deploy_frontend = false
  }

  assert {
    condition     = !contains(keys(google_compute_instance_group_manager.role), "frontend")
    error_message = "Sin frontend no debe haber grupo de frontend"
  }

  assert {
    condition     = length(google_compute_backend_service.frontend) == 0
    error_message = "Sin frontend no debe haber backend de frontend"
  }
}

run "conexiones_de_cloud_sql" {
  command = plan

  variables {
    api_db_max_open_conns = 10
  }

  expect_failures = [var.worker_db_max_open_conns]
}

run "falta_image_tag" {
  command = plan

  variables {
    image_tag = ""
  }

  expect_failures = [google_compute_instance_template.role]
}
