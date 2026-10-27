# Registro de imágenes de la aplicación. Las VM ya no clonan el repositorio ni
# compilan al arrancar, como en la entrega 2: descargan una imagen ya
# construida, que es lo que permite que una instancia nueva del autoscaler
# esté sirviendo en minutos.
#
# Las etiquetas son inmutables: una etiqueta identifica siempre el mismo
# binario, así que dos instancias del mismo grupo no pueden estar corriendo
# código distinto por haber descargado la "misma" etiqueta en momentos
# distintos. Se publican con scripts/publish_images.sh.
resource "google_artifact_registry_repository" "images" {
  repository_id = "${var.name_prefix}-images"
  location      = var.region
  format        = "DOCKER"
  description   = "Imágenes de la plataforma MOOC (api, worker, frontend)"
  labels        = local.labels

  docker_config {
    immutable_tags = true
  }

  depends_on = [google_project_service.enabled]
}

resource "google_artifact_registry_repository_iam_member" "reader" {
  for_each = toset(["api", "worker", "frontend"])

  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = google_service_account.role[each.value].member
}
