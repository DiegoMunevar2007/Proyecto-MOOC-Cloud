# Métricas de la cola que publica mooc-queue (scripts/queue_metrics.sh).
#
# Se declaran aquí en vez de dejar que Cloud Monitoring las cree con el primer
# punto: el autoscaler de workers apunta a backlog desde que se crea, y si el
# descriptor todavía no existe lo rechaza o queda reportando que la métrica no
# existe hasta que llegue el primer dato.
locals {
  queue_metrics = {
    pending = "Trabajos esperando en la cola media de asynq"
    active  = "Trabajos de la cola media en ejecución en algún worker"
    backlog = "Trabajos pendientes más activos: la señal del autoscaler de workers"
  }
}

resource "google_monitoring_metric_descriptor" "queue" {
  for_each = local.queue_metrics

  type         = "custom.googleapis.com/mooc/queue/${each.key}"
  display_name = "MOOC cola ${each.key}"
  description  = each.value
  metric_kind  = "GAUGE"
  value_type   = "DOUBLE"
  unit         = "1"

  labels {
    key         = "queue"
    value_type  = "STRING"
    description = "Nombre de la cola de asynq"
  }

  depends_on = [google_project_service.enabled]
}
