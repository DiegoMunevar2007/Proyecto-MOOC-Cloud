# Plataforma MOOC — Entrega 3, ISIS4426

Go API + worker asynq, React/Vite, Redis, ClamAV, PostgreSQL y almacenamiento de objetos. La infraestructura preparada usa dos MIG independientes de 1–3 instancias, API por CPU y workers por backlog, balanceador externo HTTPS y frontend fijo. Redis/ClamAV quedan fuera de los grupos.

**Estado al 2026-10-29:** implementación y preparación de pruebas/documentación en curso. El despliegue elástico, las mediciones cloud y el video final siguen pendientes. Las imágenes `652591e65fc2` no incluyen los cambios nuevos. La URL pública se registrará después de aplicar y verificar la infraestructura; no hay una URL de entrega 3 acreditada todavía.

## Documentación de entrega 3

- [Arquitectura y decisiones](docs/entrega3/arquitectura.md), con [fuentes de diagramas](docs/entrega3/diagramas/).
- [Flujos del frontend y prueba de navegador](docs/entrega3/frontend.md).
- [Operación y verificación del despliegue](docs/entrega3/operacion.md).
- [Calidad SonarQube en GitHub Actions](docs/entrega3/calidad.md) y [deuda técnica](docs/entrega3/deuda-tecnica.md).
- [Pruebas de carga y elasticidad](capacity-planning/pruebas_de_carga_entrega3.md), [costos](docs/entrega3/costos.md).
- [Matriz de cierre, identificadores finales y guion del video](docs/entrega3/cierre.md).

## Desarrollo local

Requiere Docker Compose reciente con soporte `!override`/`!reset`. Crear `.env` desde `.env.example` si todavía no existe; las credenciales de ejemplo son solo locales.

```bash
# Desde la raíz; conserva los datos existentes.
docker compose -p mooc-local -f docker-compose.yml -f compose.dev.yml up -d --build
```

Abrir <http://localhost:5180> o <http://mooc.localhost:5180>. El frontend conecta con la API por el proxy de Vite; los archivos se cargan directamente al almacenamiento local. Esperar a que ClamAV esté healthy antes de probar medios. En equipos con poca memoria, ejecutar Sonar y compilaciones por separado del recorrido multimedia.

El registro público solo permite estudiantes. Para preparar un administrador local, `./main provision-admin` lee un objeto JSON con `username`, `email`, `password` por stdin dentro del contenedor de la API (operador autenticado; no endpoint público). La contraseña debe tener 12–72 bytes y no debe pasarse por argumentos o guardarse en el repo. El comando no sobrescribe cuentas existentes. Para la prueba automática, el wrapper siguiente crea una cuenta temporal sin imprimir su contraseña:

```bash
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cd ..
# Descargar los medios Git LFS o indicar E2E_VIDEO_PATH=/ruta/a/video-real.mp4.
python3 scripts/test_browser.py
```

## Verificación

GitHub Actions ejecuta Go con race detector, integración PostgreSQL/Redis, build TypeScript/Vite, recorrido de navegador, Terraform con mocks y SonarQube efímero. No requiere conectar una cuenta SonarCloud ni crea recursos de GCP. El reporte completo queda como artefacto por SHA; conservarlo para la entrega.

```bash
cd backend && go test ./...
# La integración requiere POSTGRES_TEST_DSN y REDIS_TEST_ADDR; ver workflow.
cd ../scripts/IaC
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
terraform test
```

## Despliegue y sustentación

La preparación del repositorio **no autoriza crear recursos**. Seguir [operacion.md](docs/entrega3/operacion.md): inventario de recursos `mooc-*`, comprobación de state local, publicación de nuevas imágenes solo con permiso, plan actualizado y revisión antes del apply autorizado. No aplicar el plan antiguo para probar estos cambios. No importar, borrar ni ejecutar destroy automáticamente. No versionar tfvars, state ni planes.

Tras verificar cloud, registrar `app_url`, `lb_ip`, `image_tag`, SHA, run de Actions, evidencia de carga y enlace del video en [cierre.md](docs/entrega3/cierre.md). Credenciales de prueba por el canal privado del curso. La revisión/merge del PR #1 y la release/tag final se coordinan con Diego.

Histórico: [arquitectura entrega 2](docs/entrega2/arquitectura.md), [informe de carga entrega 2](capacity-planning/pruebas_de_carga_entrega2.md), tag `entrega-2` y [video de entrega 2](https://youtu.be/WeTkZry5aL4). No sustituyen la evidencia requerida para entrega 3.
