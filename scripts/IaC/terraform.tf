terraform {
  required_version = ">= 1.14"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
    # Solo para ssl_mode = "self_signed": genera la clave y el certificado que
    # se suben al balanceador.
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Backend local por defecto (laboratorio). Para estado compartido,
  # crear un bucket y descomentar el backend GCS:
  #
  # backend "gcs" {
  #   bucket = "<PROJECT_ID>-tfstate"
  #   prefix = "entrega3"
  # }
}
