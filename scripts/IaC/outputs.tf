# Solo valores del despliegue. Los comandos de verificación y el runbook viven
# en README.md: un output es un valor que un script consume, no documentación.
output "project_id" {
  description = "Proyecto de GCP donde se desplegó la plataforma"
  value       = var.project_id
}

output "app_url" {
  description = "URL pública de la aplicación (balanceador HTTPS)"
  value       = local.app_url
}

output "lb_ip" {
  description = "IP pública del balanceador"
  value       = google_compute_global_address.lb.address
}

output "lb_domain" {
  description = "Dominio del certificado del balanceador"
  value       = local.lb_domain
}

output "ssl_mode" {
  description = "Tipo de certificado del balanceador (managed o self_signed)"
  value       = var.ssl_mode
}

output "image_repository" {
  description = "Repositorio de Artifact Registry donde publish_images.sh sube las imágenes"
  value       = local.image_repo
}

output "image_tag" {
  description = "Etiqueta de imagen desplegada en los grupos"
  value       = var.image_tag
}

output "instance_groups" {
  description = "Grupos de instancias administrados por rol"
  value       = { for role, mig in google_compute_instance_group_manager.role : role => mig.name }
}

output "autoscalers" {
  description = "Autoscalers de API y workers"
  value = {
    api    = google_compute_autoscaler.api.name
    worker = google_compute_autoscaler.worker.name
  }
}

output "queue_instance_name" {
  description = "VM de la cola compartida (Redis, ClamAV, Mailpit)"
  value       = google_compute_instance.queue.name
}

output "queue_internal_ip" {
  description = "IP privada de mooc-queue"
  value       = google_compute_address.queue_internal.address
}

output "queue_backlog_metric" {
  description = "Métrica de grupo que usa el autoscaler de workers"
  value       = google_monitoring_metric_descriptor.queue["backlog"].type
}

output "postgres_private_ip" {
  description = "IP privada de la instancia administrada de PostgreSQL"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "postgres_connection_name" {
  description = "Nombre de conexión de Cloud SQL"
  value       = google_sql_database_instance.postgres.connection_name
}

output "bucket_originals" {
  description = "Bucket de objetos originales"
  value       = google_storage_bucket.originals.name
}

output "bucket_hls" {
  description = "Bucket de derivados HLS"
  value       = google_storage_bucket.hls.name
}

output "bucket_public" {
  description = "Bucket público (miniaturas e insignias)"
  value       = google_storage_bucket.public.name
}

output "service_accounts" {
  description = "Cuenta de servicio de cada rol"
  value       = { for role, sa in google_service_account.role : role => sa.email }
}

output "metrics_scrape_interval" {
  description = "Intervalo de recolección de métricas del Ops Agent en cada VM"
  value       = var.metrics_scrape_interval
}

output "loadgen_internal_ip" {
  description = "IP privada del generador de carga (vacío si deploy_loadgen está en false)"
  value       = var.deploy_loadgen ? google_compute_instance.loadgen[0].network_interface[0].network_ip : ""
}
