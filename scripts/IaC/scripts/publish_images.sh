#!/usr/bin/env bash
# Construye y publica las imágenes api, worker y frontend en Artifact Registry
# e imprime la etiqueta que va en terraform.tfvars (image_tag).
#
# Uso, desde scripts/IaC y con el repositorio ya creado:
#   terraform apply -target=google_artifact_registry_repository.images
#   ./scripts/publish_images.sh
#
# Variables opcionales:
#   PROJECT_ID     proyecto (por defecto, el de terraform output o gcloud config)
#   REGION         región del registro (por defecto us-central1)
#   REPOSITORY     repositorio (por defecto mooc-images)
#   IMAGE_TAG      etiqueta a publicar (por defecto, el commit actual)
#   SKIP_FRONTEND  true para no construir el frontend (con deploy_frontend=false)
#   PLATFORM       plataforma de destino (por defecto linux/amd64, la de las VM)
#
# La etiqueta es el commit corto. Si hay cambios sin confirmar se le añade
# -dirty-<fecha>, para que nunca se publique como un commit algo que no lo es.
# El repositorio tiene etiquetas inmutables: si la etiqueta ya existe para una
# imagen, esa imagen no se vuelve a construir.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IAC_DIR="$(dirname "${SCRIPT_DIR}")"
REPO_ROOT="$(git -C "${IAC_DIR}" rev-parse --show-toplevel)"

tf_output() { terraform -chdir="${IAC_DIR}" output -raw "$1" 2>/dev/null || true; }

REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-mooc-images}"
PLATFORM="${PLATFORM:-linux/amd64}"
SKIP_FRONTEND="${SKIP_FRONTEND:-false}"

# El repositorio sale de Terraform si ya hay outputs; si no (por ejemplo tras un
# apply con -target), se arma con el proyecto de gcloud.
IMAGE_REPO="$(tf_output image_repository)"
if [[ -z "${IMAGE_REPO}" || "${IMAGE_REPO}" == *"Warning"* ]]; then
  PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
  [[ -n "${PROJECT_ID}" ]] || { echo "No hay PROJECT_ID: expórtalo o configura gcloud" >&2; exit 1; }
  IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
fi
REGISTRY_HOST="${IMAGE_REPO%%/*}"

if [[ -z "${IMAGE_TAG:-}" ]]; then
  IMAGE_TAG="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD)"
  if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain -- backend frontend)" ]]; then
    IMAGE_TAG="${IMAGE_TAG}-dirty-$(date -u +%Y%m%d%H%M%S)"
  fi
fi

echo "==> registro  ${IMAGE_REPO}"
echo "==> etiqueta  ${IMAGE_TAG}"
echo "==> destino   ${PLATFORM}"

gcloud auth configure-docker "${REGISTRY_HOST}" --quiet >/dev/null 2>&1

exists() {
  gcloud artifacts docker images describe "$1" >/dev/null 2>&1
}

build() {
  local name="$1" context="$2" dockerfile="$3"; shift 3
  local ref="${IMAGE_REPO}/${name}:${IMAGE_TAG}"
  if exists "${ref}"; then
    echo "==> ${name}: ${ref} ya existe, se reutiliza"
    return 0
  fi
  echo "==> ${name}: construyendo ${ref}"
  docker buildx build --platform "${PLATFORM}" \
    -f "${dockerfile}" -t "${ref}" --push "$@" "${context}"
}

build api "${REPO_ROOT}/backend" "${REPO_ROOT}/backend/Dockerfile"
build worker "${REPO_ROOT}/backend" "${REPO_ROOT}/backend/worker/Dockerfile"
if [[ "${SKIP_FRONTEND}" != "true" ]]; then
  # El balanceador sirve frontend y API en el mismo origen: el frontend llama a
  # /api/... relativo y no necesita conocer la URL pública al construirse.
  build frontend "${REPO_ROOT}/frontend" "${REPO_ROOT}/frontend/Dockerfile" \
    --build-arg NEXT_PUBLIC_API_URL=
else
  echo "==> frontend: omitido (SKIP_FRONTEND=true); usa deploy_frontend = false"
fi

echo
echo "Imágenes publicadas. En terraform.tfvars:"
echo "  image_tag = \"${IMAGE_TAG}\""
echo "IMAGE_TAG=${IMAGE_TAG}"
