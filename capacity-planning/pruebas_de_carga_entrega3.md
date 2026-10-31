# Pruebas de carga — Entrega 3

**Estado: protocolo y herramientas preparados; mediciones cloud pendientes.** No se han ejecutado corridas contra los MIG nuevos. Los números de la entrega 2 son históricos y no demuestran elasticidad. Este documento debe completarse con datos reales antes de entregar.

## Hipótesis y controles

La API escala por CPU promedio 0.6, entre 1 y 3 instancias. Los workers escalan por `pending + active` de la cola media, asignación de 4 trabajos por instancia, entre 1 y 3. La cola permanece en mooc-queue. Frontend fijo de 1 instancia. No cambiar estas políticas durante una comparación sin aprobación y una corrida identificada por separado.

Registrar por corrida: SHA, image_tag, hash de configuración, UTC inicio/fin, región/zona, tipo de VM, pools, concurrencia, tamaños de medios, carga ofrecida, pausas, número de usuarios, origen/red del generador, TLS y versiones de k6. Usar el mismo corpus lógico y perfiles de medios que la entrega 2; generar nuevos IDs/sesiones para el entorno actual. No reutilizar tokens históricos.

Cada repetición tiene RUN_ID único. Guardar archivos crudos, no solo capturas. Las tareas históricas `esc1:level` y `esc2:*` escriben nombres fijos: copiar sus resultados a `results/entrega3/$RUN_ID/` antes de repetir un nivel. No ejecutar `esc1:all` sin archivar la primera L3, pues la repetición sobrescribe su nombre histórico.

## Preparación

Solo después de autorizar el despliegue y verificar [operación](../docs/entrega3/operacion.md): backends sanos, certificado válido, cola vacía, métricas de ambos grupos y Cloud SQL disponibles, reloj sincronizado. Aprovisionar un administrador por el canal de operación privado. Los scripts de seed no pueden crear administradores públicos.

```bash
cd capacity-planning
export ENV=gcp INSECURE_TLS=false
export BASE_URL="$(terraform -chdir=../scripts/IaC output -raw app_url)"
# ADMIN_USER, ADMIN_PASS y SEED_PASSWORD se cargan en el entorno desde canal privado.
task media:generate
task seed:all
```

El generador debe tener capacidad suficiente. `mooc-loadgen` es opcional y no está aprovisionado: crearlo requiere autorización; si se usa el portátil, registrar ese límite y no atribuir su saturación a la aplicación. Los seeds y datasets contienen sesiones: mantenerlos privados. No publicar logs de Task que impriman contraseñas de parámetros antiguos.

## Escenarios 1 y 2: repetición comparable

Repetir actividad académica (login separado del tráfico de lectura/escritura), carga directa, TUS, consumo HLS y drenaje. Para cada nivel guardar throughput conseguido, p50/p95/p99, errores, dropped_iterations, CPU/RAM/red/disco por rol, conexiones/CPU/RAM de Cloud SQL y cola. Repetir al menos tres veces el nivel cercano al límite y reportar mediana y rango, sin seleccionar únicamente la mejor corrida.

| Escenario/nivel | Entrega 2: fuente | Entrega 3: RUN_ID | E2/E3 p95 y op/s | Errores | Cuello de botella y diferencia de condiciones |
|---|---|---|---|---|---|
| Académico L0–L4/T1–T5 | [Informe previo](pruebas_de_carga_entrega2.md) | Pendiente | Pendiente | Pendiente | Pendiente |
| Carga M0–M2 / TUS | Informe previo | Pendiente | Pendiente | Pendiente | Pendiente |
| HLS / drenaje | Informe previo | Pendiente | Pendiente | Pendiente | Pendiente |

## Escenario 3A: ciclo de API

[k6/esc3_api.js](k6/esc3_api.js) ofrece login real con bcrypt y comprueba identidad de la sesión en una petición posterior. Desconecta cada sesión para evitar acumulación artificial. Base 1 iteración/s, rampa 2 min, meseta 10 min (PEAK_RATE=12 por defecto), descenso 1 min y observación 20 min a demanda baja: 34 min. Ajustar únicamente la **demanda** tras un piloto si no alcanza el umbral; conservar el piloto como tal. El guard de error detiene cargas severamente fallidas; una corrida abortada no acredita el ciclo.

```bash
export RUN_ID=3a-r1
python3 observar_autoscaling.py --project proyecto-2-cloud-509714 \
  --duration 2700 --output "results/entrega3/$RUN_ID/autoscaling.jsonl"
# En otra terminal con el mismo RUN_ID y credenciales:
task esc3:api
```

Demostrar aumento automático, reparto HTTP entre réplicas sanas (`X-Served-By`), sesión persistente y regreso automático al mínimo. Que haya tres VM RUNNING no prueba que atiendan tráfico. Si no vuelve al mínimo, extender observación y explicar estabilización/cooldown; no reducir manualmente para simular un éxito.

## Escenario 3B: ciclo de workers

[k6/esc3_workers.js](k6/esc3_workers.js) reutiliza cargas directas reales. Base 1 VU, rampa 2 min, meseta 10 min (PEAK_VUS=2 y UPLOAD_PAUSE_SEC=20 por defecto), baja a cero y observa 40 min en total. La carga necesaria depende de la duración real del transcode: calibrar sin cambiar la señal de escalado. Es el backlog quien debe causar el aumento.

```bash
export RUN_ID=3b-r1
# Iniciar el mismo observador, con archivo independiente, en otra terminal.
task esc3:workers
# Después del drenaje, con ADMIN_TOKEN en el entorno:
python3 reconciliar_trabajos.py --manifest "results/entrega3/$RUN_ID/accepted.jsonl" \
  --output "results/entrega3/$RUN_ID/reconciliation.json"
```

El manifiesto correlaciona cargas aceptadas con recurso, objeto y tarea. La reconciliación comprueba que cada recurso llega a clean/ready con HLS y el mismo objeto. Esto no prueba por sí solo ausencia de ejecuciones duplicadas: contrastar logs de trabajadores, TaskIDs y salidas. Reintentos son válidos si no duplican efectos finales. Probar retirada de un worker ocupado únicamente con autorización de la operación concreta; capturar terminación, reentrega y finalización. La reducción natural a una réplica no demuestra por sí sola recuperación de una tarea interrumpida.

## Métricas y tiempos

El observador hace solo lecturas de MIG, autoscaler y salud del LB cada 30 s; conserva errores y duración de la consulta. Exportar Cloud Monitoring al terminar (esperar la latencia de ingestión):

```bash
python3 exportar_prometheus.py --project proyecto-2-cloud-509714 \
  --inicio "$START_UTC" --fin "$END_UTC" --nombre "$RUN_ID" \
  --salida "results/entrega3/$RUN_ID/monitoring"
python3 -m pip install -r requirements-entrega3.txt
python3 graficar_elasticidad.py --input "results/entrega3/$RUN_ID/autoscaling.jsonl" \
  --output "results/entrega3/$RUN_ID/elasticidad.png"
```

Incluye señal custom de cola y métricas Cloud SQL además de aplicación/host. Una serie vacía o un error de exportación debe investigarse; no equivale a consumo cero. [Referencia de métricas Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/admin-api/metrics).

Distinguir: t0 carga; t1 cruce de señal sostenido; t2 cambio de recomendación del autoscaler; t3 creación; t4 readiness/HEALTHY; t5 primer tráfico o trabajo útil; t6 reducción de carga; t7 retirada; t8 mínimo estable. Reacción=t2−t1; arranque=t4−t3; efecto=t5−t0; reducción=t8−t6. Usar guest attributes `mooc/status`, `mooc/ready-uptime-sec`, eventos de GCE y logs para precisión; muestras cada 30 s solo acotan los tiempos.

| Corrida | Señal umbral | Reacción | Arranque | 1→máximo→1 | Errores/sesiones | Trabajos aceptados/ready/fallidos | Evidencia |
|---|---|---|---|---|---|---|---|
| 3A r1/r2/r3 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | N/A | Pendiente |
| 3B r1/r2/r3 | Pendiente | Pendiente | Pendiente | Pendiente | N/A | Pendiente | Pendiente |

## Conclusiones por completar

Tras medir: capacidad sostenible, cuello de botella observado (incluida DB y cola central), comparación E2/E3, ganancia/penalización del escalado, duración de arranque, continuidad e idempotencia, costo por corrida y límites de validez. Vincular cada afirmación a datos crudos o a un cálculo reproducible. No dar por resuelto un resultado adverso cambiando los umbrales después de medir.
