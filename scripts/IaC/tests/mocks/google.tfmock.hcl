# Valores de los mocks del proveedor google. Los aleatorios que genera
# terraform test no pasan las validaciones de formato del proveedor (miembros
# IAM, ids de red), así que aquí se fijan con la forma que tendrían en GCP.

mock_resource "google_service_account" {
  defaults = {
    email  = "mock@proyecto-test.iam.gserviceaccount.com"
    member = "serviceAccount:mock@proyecto-test.iam.gserviceaccount.com"
  }
}

mock_resource "google_compute_network" {
  defaults = {
    id        = "projects/proyecto-test/global/networks/mooc-vpc"
    self_link = "https://www.googleapis.com/compute/v1/projects/proyecto-test/global/networks/mooc-vpc"
  }
}

mock_resource "google_compute_subnetwork" {
  defaults = {
    id        = "projects/proyecto-test/regions/us-central1/subnetworks/mooc-app-subnet"
    self_link = "https://www.googleapis.com/compute/v1/projects/proyecto-test/regions/us-central1/subnetworks/mooc-app-subnet"
  }
}

mock_resource "google_compute_global_address" {
  defaults = {
    address = "34.1.2.3"
    id      = "projects/proyecto-test/global/addresses/mooc-lb-ip"
  }
}

mock_resource "google_sql_database_instance" {
  defaults = {
    private_ip_address = "10.20.0.3"
  }
}

mock_data "google_compute_image" {
  defaults = {
    self_link = "https://www.googleapis.com/compute/v1/projects/debian-cloud/global/images/debian-12-mock"
  }
}
