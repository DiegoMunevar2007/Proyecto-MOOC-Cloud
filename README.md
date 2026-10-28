# Plataforma MOOC

Aplicación de cursos masivos abiertos en línea, desarrollada como monolito modular en Go con workers independientes, cola de mensajes y almacenamiento de objetos. Esta entrega (entrega 3) es la aplicación elástica sobre IaaS en Google Cloud: la API y los workers corren en dos grupos de instancias independientes con autoscaling, de 1 a 3 instancias cada uno, detrás de un balanceador externo HTTPS. La cola compartida (Redis), el antimalware y el correo de pruebas viven en una VM aparte, fuera de los grupos; la base de datos es Cloud SQL y los objetos están en Cloud Storage.

- La API escala por CPU promedio del grupo (objetivo 0.6).
- Los workers escalan por el backlog de la cola, que la VM de la cola publica en Cloud Monitoring cada 30 s: una instancia por cada 4 trabajos pendientes o en curso.

## Aplicación desplegada

La aplicación responde en la URL que imprime `terraform output app_url`, de la forma `https://<IP del balanceador>.sslip.io`, con un certificado administrado por Google. El endpoint `/health` sirve para comprobar que la plataforma está arriba: además de responder, verifica la conexión con PostgreSQL y con Redis, y la cabecera `X-Served-By` dice qué instancia del grupo atendió la petición.

La entrega 2 (dos VM fijas) está identificada con el tag `entrega-2`.

Las cuentas de prueba y las credenciales se entregan por el canal privado del curso y no se publican aquí.

## Documentación

La arquitectura elástica de esta entrega, las señales de escalamiento y el procedimiento de despliegue y verificación están en [`scripts/IaC/README.md`](scripts/IaC/README.md).

De la entrega 2: el documento de arquitectura está en [`docs/entrega2/arquitectura.md`](docs/entrega2/arquitectura.md). Explica los componentes y sus responsabilidades, el modelo de despliegue, las decisiones y adaptaciones frente a la entrega anterior, el procedimiento de operación y recuperación, y el costo con sus limitaciones.

Los diagramas de componentes y de despliegue están en [`docs/entrega2/diagramas/`](docs/entrega2/diagramas/).

El informe de capacidad de los dos escenarios está en [`capacity-planning/pruebas_de_carga_entrega2.md`](capacity-planning/pruebas_de_carga_entrega2.md), con las gráficas en [`capacity-planning/graficas/`](capacity-planning/graficas/).

## Sustentación

El video de sustentación de la entrega 2 está en [youtu.be/WeTkZry5aL4](https://youtu.be/WeTkZry5aL4).

## Despliegue

La infraestructura se aprovisiona con Terraform desde `scripts/IaC`. Las máquinas no compilan nada al arrancar: descargan imágenes publicadas en Artifact Registry, así que primero se crea el registro y se publican las imágenes:

```bash
cd scripts/IaC
cp terraform.tfvars.example terraform.tfvars        # project_id
terraform init
terraform apply -target=google_artifact_registry_repository.images
./scripts/publish_images.sh                          # imprime image_tag
# poner image_tag = "<etiqueta>" en terraform.tfvars
terraform plan -out=plan.tfplan
terraform apply plan.tfplan
```

Todas las máquinas usan el mismo `scripts/IaC/scripts/startup.sh` y `shutdown.sh`; lo que cambia por rol llega por metadatos. Los secretos se guardan en Secret Manager y cada rol tiene su propia cuenta de servicio con acceso solo a los suyos. No hay credenciales en el repositorio ni en las imágenes.

El detalle del despliegue, la verificación y las señales de escalamiento está en [`scripts/IaC/README.md`](scripts/IaC/README.md).

## Pruebas

El corpus sintético y las corridas de carga se manejan con las tareas del `Taskfile` de `capacity-planning`. Hacen falta las herramientas `k6` y `go-task`:

```bash
cd capacity-planning
export ENV=gcp
export ADMIN_USER=admin1 ADMIN_PASS='...' SEED_PASSWORD='...'
task seed:all      # siembra el corpus
task esc1:all      # escenario 1
task esc2:all      # escenario 2
```

Las corridas conviene ejecutarlas desde la máquina `mooc-loadgen` (`deploy_loadgen = true`), para no medir el enlace del portátil. `task gcp:reparto` muestra cómo reparte el balanceador entre las instancias de la API. Cada corrida deja un resumen y un archivo de muestras en `capacity-planning/results/`.

## Estructura

- `backend/`: la API en Go, organizada por módulos de negocio. Las pruebas corren con `go test ./...`; la de migraciones concurrentes necesita `POSTGRES_TEST_DSN`.
- `backend/worker/`: el worker que consume la cola, escanea y transcodifica.
- `frontend/`: SPA de React (Vite) servida por nginx: catálogo, inscripciones, sesión y una vista de estado que muestra el reparto del balanceador entre las instancias de la API.
- `capacity-planning/`: guiones de k6, datos de prueba, resultados, gráficas y el informe de capacidad.
- `docs/entrega2/`: documentación de arquitectura, diagramas y evidencia del despliegue.
- `scripts/IaC/`: infraestructura como código, guiones de arranque y apagado de las máquinas, publicación de imágenes y pruebas de Terraform (`terraform test`).
