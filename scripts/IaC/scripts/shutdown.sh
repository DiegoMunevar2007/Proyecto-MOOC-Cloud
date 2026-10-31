#!/usr/bin/env bash
# Apagado común a todas las VM de la aplicación.
#
# Compute Engine lo ejecuta al detener o borrar la VM, también cuando el
# autoscaler retira una instancia o el grupo la reemplaza, y le concede unos
# 90 s. docker stop manda SIGTERM al contenedor y espera su --stop-timeout
# (fijado por startup.sh según el rol) antes del SIGKILL:
#   api     deja de aceptar conexiones y termina las peticiones en curso
#           (API_SHUTDOWN_TIMEOUT); el balanceador ya la sacó del backend.
#   worker  asynq deja de tomar trabajos y espera a los activos
#           (WORKER_SHUTDOWN_TIMEOUT); los que no terminan vuelven a la cola.
#   queue   Redis cierra el AOF limpio antes de que se apague el disco.
set -uo pipefail
exec > >(tee -a /var/log/mooc-shutdown.log) 2>&1

META="http://metadata.google.internal/computeMetadata/v1"
ROLE="$(curl -fsS -H "Metadata-Flavor: Google" "${META}/instance/attributes/mooc-role" 2>/dev/null || true)"

curl -fsS -X PUT --data stopping -H "Metadata-Flavor: Google" \
  "${META}/instance/guest-attributes/mooc/status" >/dev/null 2>&1 || true

echo "==> [${ROLE:-?}] $(date -u +%H:%M:%S) apagando"
case "${ROLE}" in
  queue) contenedores="mooc-mailpit mooc-clamav mooc-redis" ;;
  api | worker | frontend) contenedores="mooc-${ROLE}" ;;
  *) contenedores="" ;;
esac

if [ "${ROLE}" = "queue" ]; then
  systemctl stop mooc-queue-metrics 2>/dev/null || true
fi

for c in ${contenedores}; do
  if docker inspect "${c}" >/dev/null 2>&1; then
    inicio=$(date +%s)
    docker stop "${c}" >/dev/null 2>&1 || true
    echo "==> [${ROLE}] ${c} detenido en $(( $(date +%s) - inicio ))s"
  fi
done
echo "==> [${ROLE:-?}] $(date -u +%H:%M:%S) apagado completo"
