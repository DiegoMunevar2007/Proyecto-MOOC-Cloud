#!/usr/bin/env bash
# Publicador de la métrica de la cola, instalado en mooc-queue como el servicio
# systemd mooc-queue-metrics (lo instala startup.sh).
#
# Cada INTERVAL segundos lee de Redis el tamaño de la cola de asynq y escribe en
# Cloud Monitoring tres series de tipo global:
#   custom.googleapis.com/mooc/queue/pending   trabajos esperando
#   custom.googleapis.com/mooc/queue/active    trabajos en ejecución
#   custom.googleapis.com/mooc/queue/backlog   pending + active
#
# backlog es la señal del autoscaler de workers. Se publica desde aquí, y no
# desde el /metrics de la API o del worker, porque es una métrica del grupo y
# no de una instancia: con tres API la publicarían tres veces, y con cero
# workers nadie la publicaría justo cuando hace falta escalar.
#
# Las claves son las de asynq: asynq:{<cola>}:pending y asynq:{<cola>}:active
# son listas, y LLEN da su tamaño sin recorrerlas.
#
# Variables (de /etc/mooc/queue-metrics.env): PROJECT_ID, REDIS_PASSWORD,
# QUEUE (media), INTERVAL (30), REDIS_CONTAINER (mooc-redis).
set -uo pipefail

: "${PROJECT_ID:?falta PROJECT_ID}"
: "${REDIS_PASSWORD:?falta REDIS_PASSWORD}"
QUEUE="${QUEUE:-media}"
INTERVAL="${INTERVAL:-30}"
REDIS_CONTAINER="${REDIS_CONTAINER:-mooc-redis}"

META="http://metadata.google.internal/computeMetadata/v1"
API="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries"
RESPUESTA="$(mktemp)"
trap 'rm -f "${RESPUESTA}"' EXIT

llen() {
  docker exec -e REDISCLI_AUTH="${REDIS_PASSWORD}" "${REDIS_CONTAINER}" \
    redis-cli LLEN "asynq:{${QUEUE}}:$1" 2>/dev/null | tr -d '[:space:]'
}

token() {
  curl -fsS -H "Metadata-Flavor: Google" "${META}/instance/service-accounts/default/token" \
    | sed -E 's/.*"access_token":"([^"]+)".*/\1/'
}

serie() {
  printf '{"metric":{"type":"custom.googleapis.com/mooc/queue/%s","labels":{"queue":"%s"}},"resource":{"type":"global","labels":{"project_id":"%s"}},"points":[{"interval":{"endTime":"%s"},"value":{"doubleValue":%s}}]}' \
    "$1" "${QUEUE}" "${PROJECT_ID}" "$2" "$3"
}

echo "publicando la cola ${QUEUE} cada ${INTERVAL}s en ${API}"
while true; do
  pending="$(llen pending)"
  active="$(llen active)"
  if [[ "${pending}" =~ ^[0-9]+$ && "${active}" =~ ^[0-9]+$ ]]; then
    backlog=$((pending + active))
    ahora="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    cuerpo="{\"timeSeries\":[$(serie pending "${ahora}" "${pending}"),$(serie active "${ahora}" "${active}"),$(serie backlog "${ahora}" "${backlog}")]}"
    codigo="$(curl -sS -o "${RESPUESTA}" -w '%{http_code}' -X POST \
      -H "Authorization: Bearer $(token)" -H "Content-Type: application/json" \
      --data "${cuerpo}" "${API}" 2>/dev/null)"
    if [ "${codigo}" = "200" ]; then
      echo "pending=${pending} active=${active} backlog=${backlog}"
    else
      echo "pending=${pending} active=${active} backlog=${backlog} ERROR http=${codigo} $(head -c 300 "${RESPUESTA}" | tr '\n' ' ')"
    fi
  else
    echo "no se pudo leer la cola de Redis (pending='${pending}' active='${active}')"
  fi
  sleep "${INTERVAL}"
done
