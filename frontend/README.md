# Frontend MOOC

SPA de React (Vite + TypeScript) servida por nginx en el puerto 3000.

Pantallas:

- **Catálogo**: cursos publicados con búsqueda y paginación; el detalle muestra
  módulos y unidades, y un estudiante con sesión puede inscribirse.
- **Mis cursos**: inscripciones del estudiante, con la opción de retirarse.
- **Estado**: consulta `/health` y, con «Probar balanceo», hace 20 peticiones y
  muestra cuántas atendió cada instancia de la API según la cabecera
  `X-Served-By`.
- **Ingresar**: inicio de sesión, registro y verificación de la cuenta con el
  código que llega por correo (Mailpit).

Todas las llamadas usan rutas relativas (`/api/...`, `/health`). En GCP el
balanceador sirve el frontend y la API en el mismo origen; en desarrollo el
servidor de Vite hace de proxy, así que la API no necesita CORS.

## Desarrollo

Con la API corriendo en `localhost:8080` (`docker compose up` en la raíz):

```bash
corepack enable
pnpm install
pnpm dev                                  # http://localhost:3000
API_URL=http://otra-api:8080 pnpm dev     # otra API
```

## Imagen

```bash
docker buildx build --platform linux/amd64 -t mooc-frontend .
```

El build de Vite corre nativo en la máquina que construye (los archivos son
iguales en cualquier arquitectura) y solo la etapa de nginx es `linux/amd64`.
En el despliegue la publica `scripts/IaC/scripts/publish_images.sh`.
