# Infraestructura como código — Entrega 3 (aplicación elástica IaaS)

Terraform que aprovisiona la plataforma MOOC en Google Cloud con API y workers
en **dos grupos de instancias independientes con autoscaling** (1 a 3
instancias cada uno), detrás de un **balanceador externo HTTPS**, y la cola
compartida fuera de los grupos.

```
                         Internet
                            │ 443 (80 → redirección a 443)
              ┌─────────────▼──────────────┐
              │ Balanceador de aplicaciones│  EXTERNAL_MANAGED, certificado
              │ externo global (mooc-lb-ip)│  administrado <IP>.sslip.io
              └──────┬───────────────┬─────┘
   /api/*, /health,  │               │  todo lo demás
   /openapi.json     │               │
          ┌──────────▼─────┐   ┌─────▼──────────┐
          │ mooc-api-mig   │   │ mooc-frontend- │
          │ 1–3 × e2-small │   │ mig (fijo, 1)  │
          │ CPU 0.6        │   └────────────────┘
          └───┬───────┬────┘
              │       │ Redis 6379, SMTP 1025
              │  ┌────▼──────────────────────────────┐
              │  │ mooc-queue (e2-medium, 10.10.1.30)│ ── backlog cada 30 s ──┐
              │  │ Redis · ClamAV · Mailpit          │                        │
              │  └────▲──────────────────────────────┘                        ▼
              │       │ Redis 6379, ClamAV 3310                     Cloud Monitoring
              │  ┌────┴───────────┐                                 custom.googleapis.com/
              │  │ mooc-worker-mig│ ◄──── autoscaler por backlog ──  mooc/queue/backlog
              │  │ 1–3 × e2-small │       (4 trabajos por instancia)
              │  └────┬───────────┘
              ▼       ▼
        Cloud SQL (IP privada)   Cloud Storage (3 buckets, S3 HMAC)
```

| Componente del enunciado | Recurso de Google Cloud |
|---|---|
| Capa web elástica | `google_compute_instance_group_manager.role["api"]` + `google_compute_autoscaler.api` (CPU 0.6, 1–3) |
| Capa de workers elástica | `google_compute_instance_group_manager.role["worker"]` + `google_compute_autoscaler.worker` (backlog de la cola, 1–3) |
| Balanceador de carga | Balanceador de aplicaciones externo global (`EXTERNAL_MANAGED`), certificado administrado |
| Cola de mensajería compartida | `google_compute_instance.queue` (Redis/asynq), fuera de los grupos |
| Antimalware y correo de pruebas | ClamAV y Mailpit en `mooc-queue` |
| Base de datos relacional administrada | Cloud SQL PostgreSQL con IP privada |
| Almacenamiento de objetos | 3 × `google_storage_bucket` (interoperabilidad S3) |
| Imágenes de la aplicación | Artifact Registry con etiquetas inmutables |
| Red, firewall y salida | VPC, una regla por rol, Cloud NAT; ninguna VM con IP pública |

## Qué cambió respecto a la entrega 2

- **Imágenes en vez de compilar al arrancar.** Las VM ya no clonan el
  repositorio ni hacen `docker compose up --build`: descargan una imagen
  publicada en Artifact Registry, así que una instancia nueva del autoscaler
  no compila nada antes de servir (el tiempo medido queda en el guest
  attribute `mooc/ready-uptime-sec`).
- **Un solo `startup.sh` y un solo `shutdown.sh`** para todos los roles. Lo
  que cambia por rol (imagen, puerto, entorno, secretos) llega por metadatos.
- **La cola sale de la VM del worker.** Si Redis viviera en una instancia del
  grupo, el autoscaler podría borrar la cola al reducir. `mooc-queue` es una VM
  aparte con IP fija.
- **Una cuenta de servicio por rol**, cada una con solo sus secretos. Las claves
  HMAC también son por rol (API y worker).
- **Firewall por rol** en vez de "todo lo interno con todo".
- **Ninguna VM tiene IP pública.** Lo único expuesto es el balanceador.

## Señales de escalamiento

**API — CPU promedio del grupo, objetivo 0.6.** La API es CPU-bound bajo carga
(bcrypt en el login, serialización JSON) y su CPU sí sube con las peticiones.
0.6 deja margen para absorber el pico mientras arranca la instancia nueva.

**Workers — backlog de la cola, 4 trabajos por instancia.** La CPU de un worker
llega al 100 % con un solo ffmpeg y no dice cuánto trabajo falta. El backlog
(pendientes + activos) sí. `mooc-queue` lo publica cada 30 s como métrica de
grupo (`resource.type = "global"`), y con `single_instance_assignment = 4` el
autoscaler pide `ceil(backlog / 4)` workers, porque cada uno procesa
`worker_concurrency = 4` trabajos a la vez. Al vaciarse la cola no retira más de
un worker cada 10 minutos (`scale_in_control`).

La métrica se publica desde `mooc-queue` y no desde el `/metrics` de la API o
del worker porque es del grupo, no de una instancia: con tres API se publicaría
tres veces, y con un solo worker caído nadie la publicaría justo cuando hace
falta escalar.

## Varias réplicas contra la misma base

- **Migraciones.** API y worker migran el esquema al arrancar. Con varias
  réplicas arrancando a la vez, `AutoMigrate` en paralelo falla con
  `duplicate key value violates unique constraint pg_type_typname_nsp_index`.
  `utils.MigrateWithLock` lo serializa con `pg_advisory_lock`.
- **Conexiones.** `db-f1-micro` admite 25. Cada réplica recibe su tope
  (`POSTGRES_MAX_OPEN_CONNS`): 3 API × 5 + 3 workers × 2 + 3 reservadas = 24. La
  validación de `worker_db_max_open_conns` rechaza combinaciones que no caben.
- **Apagado ordenado.** Al retirar una instancia, `shutdown.sh` hace
  `docker stop` y el proceso recibe SIGTERM: la API termina las peticiones en
  curso (`API_SHUTDOWN_TIMEOUT`, 25 s) y asynq espera los trabajos activos
  (`WORKER_SHUTDOWN_TIMEOUT`, 60 s); los que no terminan vuelven a la cola.
- **Trazabilidad.** Cada respuesta de la API lleva `X-Served-By` con el nombre
  de la instancia que la atendió.

## Requisitos previos

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.14
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) autenticado
- Docker con `buildx` (las imágenes se construyen para `linux/amd64`)
- Un proyecto con facturación habilitada

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project "$PROJECT_ID"
```

> Las APIs necesarias (`compute`, `sqladmin`, `artifactregistry`,
> `secretmanager`, `monitoring`, …) se habilitan desde Terraform.

## Despliegue

Seguir primero [el runbook de entrega 3](../../docs/entrega3/operacion.md).
La preparación del código no autoriza crear recursos. Comprobar inventario
`mooc-*` y state; si existen recursos previos sin state, detenerse y mostrarlos.
El registro ya existe en el proyecto de laboratorio: no ejecutar un apply
parcial para recrearlo, ni importar o borrar recursos sin confirmación.

```bash
cd scripts/IaC
# Conservar terraform.tfvars y state locales existentes; no sobrescribirlos.
terraform init
terraform plan -out=plan.tfplan
```

Con permiso explícito para publicar, `./scripts/publish_images.sh` construye
API, worker y frontend y devuelve una etiqueta nueva. Actualizar `image_tag`
en tfvars y volver a generar el plan. Revisar ese plan antes de un
`terraform apply plan.tfplan` autorizado. No aplicar el plan antiguo después
de cambiar código o etiquetas. No ejecutar destroy automáticamente.

La etiqueta es el commit corto (con `-dirty-<fecha>` si hay cambios sin
confirmar). Las etiquetas son inmutables: para desplegar código nuevo se publica
otra etiqueta, se cambia `image_tag` y se aplica; los grupos reemplazan sus
instancias una a una creando la nueva antes de retirar la vieja.

Si el frontend no compila, `SKIP_FRONTEND=true ./scripts/publish_images.sh` y
`deploy_frontend = false`: todo el tráfico va entonces a la API.

## Verificación

El `apply` termina antes de que las VM estén sirviendo. Cada VM deja su estado
en guest attributes:

```bash
ZONE=us-central1-a
gcloud compute instance-groups managed list-instances mooc-api-mig --zone $ZONE
gcloud compute instance-groups managed list-instances mooc-worker-mig --zone $ZONE
gcloud compute backend-services get-health mooc-api-backend --global

# status=ready y ready-uptime-sec = segundos desde el arranque hasta servir
gcloud compute instances get-guest-attributes <instancia> --zone $ZONE --query-path=mooc/

# métrica de la cola (pending, active, backlog cada 30 s)
gcloud compute ssh mooc-queue --zone $ZONE --tunnel-through-iap \
  --command 'sudo journalctl -u mooc-queue-metrics -n 5 --no-pager'

# certificado: PROVISIONING durante 15-60 min, luego ACTIVE
gcloud compute ssl-certificates list
curl -i "$(terraform output -raw app_url)/health"   # 200 con X-Served-By

# reparto entre réplicas
for i in $(seq 20); do curl -s -o /dev/null -D - "$(terraform output -raw app_url)/health" \
  | grep -i x-served-by; done | sort | uniq -c
```

Si una VM no llega a `ready`:

```bash
gcloud compute ssh <instancia> --zone $ZONE --tunnel-through-iap \
  --command 'sudo tail -80 /var/log/mooc-startup.log'
```

- **SSH**: solo por IAP (`--tunnel-through-iap`); el 22 no está abierto a Internet.
- **HTTPS**: con `ssl_mode = "managed"` el certificado es de Google y válido
  para `<IP>.sslip.io` (o `domain`). Mientras está en `PROVISIONING` el
  handshake TLS falla; es normal. Con `ssl_mode = "self_signed"` funciona al
  instante y los clientes lo aceptan con `curl -k` / `INSECURE_TLS=true`.
- **Base de datos**: IP privada, alcanzable solo desde la VPC por peering.

## Configuración

| Variable | Descripción | Por defecto |
|---|---|---|
| `project_id` | Proyecto de GCP | — |
| `image_tag` | Etiqueta publicada por `publish_images.sh` | — |
| `region` / `zone` | Región y zona | `us-central1` / `us-central1-a` |
| `api_min_replicas` / `api_max_replicas` | Tamaño del grupo de la API | `1` / `3` |
| `api_cpu_target` | Objetivo de CPU del autoscaler de la API | `0.6` |
| `worker_min_replicas` / `worker_max_replicas` | Tamaño del grupo de workers | `1` / `3` |
| `worker_concurrency` | Trabajos simultáneos por worker y asignación del autoscaler | `4` |
| `autoscaler_cooldown_sec` | Inicialización de una instancia nueva | `180` |
| `api_db_max_open_conns` / `worker_db_max_open_conns` | Pool de PostgreSQL por réplica | `5` / `2` |
| `api_shutdown_timeout_sec` / `worker_shutdown_timeout_sec` | Apagado ordenado | `25` / `60` |
| `ssl_mode` | `managed` o `self_signed` | `managed` |
| `domain` | Dominio público (vacío = `<IP>.sslip.io`) | `""` |
| `deploy_frontend` | Grupo del frontend detrás del balanceador | `true` |
| `api_machine_type` / `worker_machine_type` / `frontend_machine_type` | Máquinas de los grupos | `e2-small` |
| `queue_machine_type` | Máquina de `mooc-queue` | `e2-medium` |
| `db_tier` | Tier de Cloud SQL | `db-f1-micro` |
| `install_ops_agent` | Ops Agent en las VM | `true` |
| `deploy_loadgen` | VM de pruebas con k6 | `false` |

## Pruebas

```bash
terraform fmt -check -recursive
terraform validate
terraform test        # sin credenciales: proveedores mock (tests/)
```

`tests/` fija las decisiones de diseño: señales y límites de los autoscalers,
plantillas sin IP pública con los scripts comunes, la cola fuera de los grupos,
firewall y secretos por rol, rutas y certificado del balanceador, la etiqueta
obligatoria y el presupuesto de conexiones de Cloud SQL.

## Telemetría

No hay servidor Prometheus. El **Ops Agent** corre en cada VM y reporta a
Cloud Monitoring las métricas del host y las del `/metrics` del contenedor (API
en `:8080`, worker en `:9101`). Se instala en segundo plano después de que la VM
está sirviendo, para que no cuente en el tiempo de arranque. En `mooc-queue` y
en el frontend reporta solo las del host.

`/metrics` no se publica por el balanceador: la ruta va al frontend, que
responde 404.

## Pruebas de carga contra el despliegue

```bash
export ENV=gcp
export ADMIN_PASS='...' SEED_PASSWORD='...'

task -d ../../capacity-planning gcp:wait     # espera a /health por el balanceador
task -d ../../capacity-planning gcp:reparto  # X-Served-By de 30 peticiones
task -d ../../capacity-planning gcp:seed
task -d ../../capacity-planning gcp:all
```

Para medir desde la región (`deploy_loadgen = true`), la VM `mooc-loadgen` llega
al balanceador por Cloud NAT como cualquier cliente:

```bash
gcloud compute ssh mooc-loadgen --zone=us-central1-a --tunnel-through-iap
cd /opt/mooc/capacity-planning
export ENV=gcp BASE_URL=... ADMIN_PASS='...' SEED_PASSWORD='...'
k6 run k6/esc2_carga_directa.js
```

## Mailpit (correo de pruebas)

Corre en `mooc-queue`. La API lo alcanza en `10.10.1.30:1025`; la interfaz
escucha en `127.0.0.1:8025` de la VM:

```bash
gcloud compute ssh mooc-queue --zone us-central1-a --tunnel-through-iap -- -L 8025:127.0.0.1:8025
# abrir http://localhost:8025
```

## Estructura

```
scripts/IaC/
├── terraform.tf / providers.tf / variables.tf / locals.tf
├── network.tf      # VPC, subred, firewall por rol, NAT, Private Service Access
├── compute.tf      # plantillas, grupos, autoscalers, health checks, mooc-queue, loadgen
├── lb.tf           # balanceador HTTPS, certificado, redirección 80 → 443
├── monitoring.tf   # descriptores de las métricas de la cola
├── registry.tf     # Artifact Registry (etiquetas inmutables)
├── iam.tf          # APIs, cuentas de servicio por rol, Secret Manager
├── sql.tf          # Cloud SQL PostgreSQL (IP privada)
├── storage.tf      # buckets, claves HMAC por rol, CORS, lifecycle
├── outputs.tf
├── scripts/
│   ├── startup.sh          # arranque común (api, worker, frontend, queue)
│   ├── shutdown.sh         # apagado ordenado común
│   ├── queue_metrics.sh    # publicador de pending/active/backlog
│   ├── install_ops_agent.sh
│   ├── publish_images.sh   # build + push a Artifact Registry
│   └── loadgen_startup.sh
└── tests/          # terraform test con mock_provider
```

## Costos y control

Los recursos facturan mientras existan, aunque no reciban tráfico:

- Grupos: entre 3 (mínimos) y 7 `e2-small`, más `mooc-queue` (`e2-medium`).
- Balanceador: reglas de reenvío y procesamiento de datos.
- Cloud SQL: el recurso más caro; sigue facturando detenido.
- Cloud NAT, discos de 30 GiB, Artifact Registry y Cloud Storage.

Para pausar sin destruir, reducir los grupos a cero no es posible con el
autoscaler activo (mínimo 1). Al terminar la entrega: `terraform destroy`.

## Limitaciones conocidas

- Una sola zona: los grupos son zonales y `mooc-queue` es un único punto de
  falla. Un grupo regional y Memorystore lo resolverían a mayor costo.
- La métrica de la cola tiene una resolución de 30 s y el autoscaler añade su
  propio retardo: el escalamiento de workers reacciona en un par de minutos.
- El bucket público usa `allUsers` `objectViewer`; el control de acceso fino lo
  hace la API mediante URLs firmadas.
