#!/usr/bin/env bash
# Arranque común a todas las VM de la aplicación: api, worker y frontend (las
# instancias de los grupos) y queue (mooc-queue).
#
# Lo que distingue a cada rol llega por metadatos: mooc-role, la imagen, el
# puerto, el entorno sin secretos (mooc-env) y la lista de secretos a resolver
# (mooc-secrets). El script no clona el repositorio ni compila: descarga una
# imagen ya publicada en Artifact Registry, que es lo que deja a una instancia
# nueva del autoscaler sirviendo en minutos.
#
# El progreso queda en /var/log/mooc-startup.log y en guest attributes:
#   gcloud compute instances get-guest-attributes <vm> --zone <zona> --query-path=mooc/
#   status            booting | ready | failed
#   ready-uptime-sec  segundos desde que arrancó el kernel hasta estar sirviendo
#   image             imagen que corre
set -Eeuo pipefail
exec > >(tee -a /var/log/mooc-startup.log) 2>&1
export PATH="${PATH}:/usr/lib/google-cloud-sdk/bin:/snap/bin"

META="http://metadata.google.internal/computeMetadata/v1"
ENV_DIR=/etc/mooc

meta() {
  curl -fsS -H "Metadata-Flavor: Google" "${META}/instance/attributes/$1" 2>/dev/null || true
}

# Guest attributes: requieren enable-guest-attributes=TRUE en los metadatos.
guest() {
  curl -fsS -X PUT --data "$2" -H "Metadata-Flavor: Google" \
    "${META}/instance/guest-attributes/mooc/$1" >/dev/null 2>&1 || true
}

uptime_sec() { awk '{print int($1)}' /proc/uptime; }

log() { echo "==> [${ROLE:-?}] $(date -u +%H:%M:%S) $*"; }

fail() {
  echo "ERROR [${ROLE:-?}] $*" >&2
  guest status failed
  guest error "$*"
  exit 1
}

trap 'fail "falló la línea ${LINENO}"' ERR

retry() {
  local intentos="$1"; shift
  local i
  for i in $(seq 1 "${intentos}"); do
    if "$@"; then return 0; fi
    sleep $((i * 3))
  done
  return 1
}

# Espera a que un host:puerto acepte conexiones TCP.
wait_tcp() {
  local destino="$1" limite="$2" i
  for i in $(seq 1 "${limite}"); do
    if timeout 2 bash -c "</dev/tcp/${destino%:*}/${destino##*:}" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Espera a que una URL local responda 2xx.
wait_http() {
  local url="$1" limite="$2" i
  for i in $(seq 1 "${limite}"); do
    if curl -fsS -o /dev/null -m 3 "${url}"; then return 0; fi
    sleep 2
  done
  return 1
}

ROLE="$(meta mooc-role)"
PROJECT_ID="$(meta mooc-project-id)"
INSTANCE="$(curl -fsS -H "Metadata-Flavor: Google" "${META}/instance/name")"
[ -n "${ROLE}" ] || fail "la VM no tiene mooc-role en los metadatos"

guest status booting
guest ready-uptime-sec ""
log "arrancando ${INSTANCE} (uptime $(uptime_sec)s)"

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "instalando Docker"
  export DEBIAN_FRONTEND=noninteractive
  retry 5 apt-get update -y
  retry 5 apt-get install -y --no-install-recommends docker.io
fi
systemctl enable --now docker

# ---------------------------------------------------------------------------
# Secretos y entorno
# ---------------------------------------------------------------------------
secret() {
  gcloud secrets versions access latest --secret="$1" --project="${PROJECT_ID}"
}

ENV_FILE="${ENV_DIR}/${ROLE}.env"
install -d -m 700 "${ENV_DIR}"
umask 077
{
  meta mooc-env
  echo
  echo "INSTANCE_NAME=${INSTANCE}"
} | sed '/^$/d' > "${ENV_FILE}"

log "resolviendo secretos"
while IFS='=' read -r var nombre; do
  [ -n "${var}" ] || continue
  valor="$(retry 5 secret "${nombre}")" || fail "no se pudo leer el secreto ${nombre}"
  [ -n "${valor}" ] || fail "el secreto ${nombre} está vacío"
  printf '%s=%s\n' "${var}" "${valor}" >> "${ENV_FILE}"
done <<< "$(meta mooc-secrets)"
umask 022

# Lee una variable del .env del rol (para los contenedores de mooc-queue, que
# la necesitan como argumento y no como entorno).
env_value() { sed -n "s/^$1=//p" "${ENV_FILE}" | head -n1; }

# Arranca (o reemplaza) un contenedor. En un reinicio de la VM el script vuelve
# a correr: se recrea el contenedor para que tome el .env recién escrito.
run_container() {
  local nombre="$1"; shift
  docker rm -f "${nombre}" >/dev/null 2>&1 || true
  docker run -d --name "${nombre}" --restart unless-stopped \
    --log-opt max-size=50m --log-opt max-file=3 "$@" >/dev/null
}

mark_ready() {
  local t
  t="$(uptime_sec)"
  guest ready-uptime-sec "${t}"
  guest ready-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  guest status ready
  log "listo en ${t}s desde el arranque del kernel"
}

# Ops Agent fuera del camino crítico: tarda un minuto en instalarse y no hace
# falta para servir. Corre como unidad transitoria de systemd para que no
# dependa de que este script siga vivo.
start_ops_agent() {
  [ "$(meta mooc-install-ops-agent)" = "true" ] || return 0
  meta mooc-ops-agent-script > /usr/local/sbin/mooc-install-ops-agent
  chmod 700 /usr/local/sbin/mooc-install-ops-agent
  systemd-run --unit=mooc-ops-agent-install --collect \
    /usr/local/sbin/mooc-install-ops-agent \
    "$(meta mooc-metrics-target)" "$(meta mooc-metrics-scrape-interval)" >/dev/null 2>&1 \
    || log "AVISO: no se pudo lanzar la instalación del Ops Agent"
}

# ---------------------------------------------------------------------------
# Rol queue: Redis, ClamAV, Mailpit y el publicador de la métrica de la cola
# ---------------------------------------------------------------------------
start_queue() {
  local redis_password
  redis_password="$(env_value REDIS_PASSWORD)"

  log "levantando Redis"
  # maxmemory + volatile-ttl: Redis no debe poder tumbar la VM. Las claves de
  # sesión llevan TTL y caducan primero; las de asynq no, y no se desalojan.
  run_container mooc-redis --memory 300m -p 6379:6379 -v mooc-redis:/data \
    redis:8.10-alpine redis-server --appendonly yes --requirepass "${redis_password}" \
    --maxmemory 256mb --maxmemory-policy volatile-ttl

  log "levantando Mailpit"
  run_container mooc-mailpit -p 1025:1025 -p 127.0.0.1:8025:8025 -v mooc-mailpit:/data \
    -e MP_MAX_MESSAGES=5000 -e MP_DATABASE=/data/mailpit.db \
    -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 \
    axllent/mailpit

  log "levantando ClamAV"
  # clamd retiene casi 1 GB con la base de firmas cargada (ver
  # docs/entrega2/evidencia/). En la e2-medium cabe con margen.
  run_container mooc-clamav --memory 1500m -p 3310:3310 -v mooc-clamav:/var/lib/clamav \
    clamav/clamav:stable

  log "instalando el publicador de la métrica de la cola"
  meta mooc-queue-metrics-script > /usr/local/bin/mooc-queue-metrics
  chmod 755 /usr/local/bin/mooc-queue-metrics
  cat > "${ENV_DIR}/queue-metrics.env" <<EOF
PROJECT_ID=${PROJECT_ID}
REDIS_PASSWORD=${redis_password}
QUEUE=media
INTERVAL=$(meta mooc-queue-metrics-seconds)
EOF
  chmod 600 "${ENV_DIR}/queue-metrics.env"
  cat > /etc/systemd/system/mooc-queue-metrics.service <<'EOF'
[Unit]
Description=Publica pending, active y backlog de la cola media en Cloud Monitoring
After=docker.service network-online.target
Requires=docker.service

[Service]
EnvironmentFile=/etc/mooc/queue-metrics.env
ExecStart=/usr/local/bin/mooc-queue-metrics
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable mooc-queue-metrics >/dev/null 2>&1
  systemctl restart mooc-queue-metrics

  # La cola está lista cuando Redis responde: es de lo que dependen API y
  # workers para arrancar. ClamAV tarda varios minutos más en cargar firmas.
  redis_ping() {
    docker exec -e REDISCLI_AUTH="${redis_password}" mooc-redis redis-cli ping 2>/dev/null | grep -q PONG
  }
  retry 20 redis_ping || fail "Redis no respondió"
  mark_ready
  start_ops_agent

  log "esperando a que ClamAV cargue las firmas"
  if wait_tcp 127.0.0.1:3310 1200; then
    guest clamav ready
    guest clamav-uptime-sec "$(uptime_sec)"
    log "ClamAV listo"
  else
    guest clamav timeout
    log "AVISO: ClamAV no abrió el puerto 3310 en 20 minutos"
  fi
}

# ---------------------------------------------------------------------------
# Roles api, worker y frontend: un contenedor por VM
# ---------------------------------------------------------------------------
start_app() {
  local image port ready_path stop_timeout wait_for
  image="$(meta mooc-image)"
  port="$(meta mooc-port)"
  ready_path="$(meta mooc-ready-path)"
  stop_timeout="$(meta mooc-stop-timeout)"
  wait_for="$(meta mooc-wait-for)"
  [ -n "${image}" ] && [ -n "${port}" ] || fail "faltan mooc-image o mooc-port"
  guest image "${image}"

  local registry
  registry="$(meta mooc-registry-host)"
  log "autenticando Docker contra ${registry}"
  gcloud auth print-access-token \
    | docker login -u oauth2accesstoken --password-stdin "https://${registry}" >/dev/null

  log "descargando ${image}"
  retry 5 docker pull -q "${image}" >/dev/null || fail "no se pudo descargar ${image}"

  # La API y el worker terminan con panic si Redis no responde al arrancar.
  # Esperarlo aquí evita una tanda de reinicios mientras mooc-queue arranca.
  if [ -n "${wait_for}" ]; then
    log "esperando a ${wait_for}"
    wait_tcp "${wait_for}" 900 || fail "${wait_for} no respondió en 15 minutos"
  fi

  log "arrancando el contenedor"
  # --stop-timeout lo usa docker stop en shutdown.sh: el proceso recibe SIGTERM
  # y tiene ese margen para el apagado ordenado antes del SIGKILL.
  run_container "mooc-${ROLE}" --env-file "${ENV_FILE}" \
    -p "${port}:${port}" --stop-timeout "${stop_timeout:-10}" "${image}"

  log "esperando a que responda en :${port}${ready_path}"
  wait_http "http://127.0.0.1:${port}${ready_path}" 450 \
    || fail "el contenedor no respondió en :${port}${ready_path}; ver: docker logs mooc-${ROLE}"
  mark_ready
  start_ops_agent
}

case "${ROLE}" in
  queue) start_queue ;;
  api | worker | frontend) start_app ;;
  *) fail "rol desconocido: ${ROLE}" ;;
esac

log "arranque completado"
