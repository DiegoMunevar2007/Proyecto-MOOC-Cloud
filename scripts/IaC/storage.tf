resource "random_id" "bucket_suffix" {
  byte_length = 3
}

# Tres buckets lógicos (originales, derivados HLS y público) servidos por
# la API S3-compatible de Cloud Storage.
resource "google_storage_bucket" "originals" {
  name                        = local.bucket_originals
  location                    = var.region
  storage_class               = "STANDARD"
  force_destroy               = true
  uniform_bucket_level_access = true

  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"]
    response_header = ["Content-Type", "Authorization", "Upload-Offset", "Upload-Length", "Tus-Resumable", "Location", "Content-Range", "ETag"]
    max_age_seconds = 3600
  }

  # Los sidecars de tusd (.info/.part) expiran; los objetos finales quedan limpios.
  lifecycle_rule {
    condition {
      age            = 7
      matches_prefix = ["tus-meta/"]
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "hls" {
  name                        = local.bucket_hls
  location                    = var.region
  storage_class               = "STANDARD"
  force_destroy               = true
  uniform_bucket_level_access = true

  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket" "public" {
  name                        = local.bucket_public
  location                    = var.region
  storage_class               = "STANDARD"
  force_destroy               = true
  uniform_bucket_level_access = true

  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length", "ETag"]
    max_age_seconds = 3600
  }
}

# Lectura anónima de derivados e imágenes públicas (el control de acceso lo
# verifica la API antes de revelar la URL).
resource "google_storage_bucket_iam_member" "hls_public" {
  bucket = google_storage_bucket.hls.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket_iam_member" "public_public" {
  bucket = google_storage_bucket.public.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

locals {
  app_buckets = {
    originals = google_storage_bucket.originals.name
    hls       = google_storage_bucket.hls.name
    public    = google_storage_bucket.public.name
  }

  # Solo la API (TUS, URLs firmadas) y los workers (escaneo y HLS) tocan los
  # buckets. objectAdmin para leer y escribir objetos, legacyBucketReader para
  # el ListBucket que hace la interfaz S3.
  storage_roles = ["api", "worker"]
  storage_bindings = merge([
    for role in local.storage_roles : merge([
      for bucket_key, bucket in local.app_buckets : {
        for bucket_role in ["roles/storage.objectAdmin", "roles/storage.legacyBucketReader"] :
        "${role}/${bucket_key}/${bucket_role}" => { role = role, bucket = bucket, bucket_role = bucket_role }
      }
    ]...)
  ]...)
}

resource "google_storage_bucket_iam_member" "role" {
  for_each = local.storage_bindings

  bucket = each.value.bucket
  role   = each.value.bucket_role
  member = google_service_account.role[each.value.role].member
}

# Claves HMAC (interoperabilidad S3), una por rol que usa los buckets.
resource "google_storage_hmac_key" "role" {
  for_each = toset(local.storage_roles)

  service_account_email = google_service_account.role[each.value].email
  project               = var.project_id
}
