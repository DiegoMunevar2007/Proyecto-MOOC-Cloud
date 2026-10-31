# Frontend MOOC

SPA de React (Vite + TypeScript) con [shadcn/ui](https://ui.shadcn.com) sobre
Tailwind CSS v4, servida por nginx en el puerto 3000.

| Ruta | Pantalla |
|---|---|
| `/` | Catálogo con búsqueda, orden y paginación en la URL |
| `/cursos/:id` | Detalle con módulos, unidades y recursos; inscribirse, retirarse y avance |
| `/mis-cursos` | Inscripciones del estudiante con su avance |
| `/ingresar` | Ingreso, registro de estudiantes y verificación con el código de 6 dígitos |
| `/estado` | `/health` y prueba de balanceo: 24 peticiones y la instancia que atendió cada una (`X-Served-By`) |

Las rutas no pisan `/api`, `/health` ni `/openapi.json`, que el balanceador manda
a la API. Todas las llamadas usan rutas relativas: en GCP el balanceador sirve
frontend y API en el mismo origen; en desarrollo el servidor de Vite hace de
proxy, así que la API no necesita CORS.

## Diseño

- Azul ultramar como color de marca (hero y panel de ingreso) y un amarillo
  señal como único acento. Los neutros se tiñen hacia el mismo matiz.
- Bricolage Grotesque para los títulos y Figtree para el texto, autoalojadas con
  `@fontsource`: no hay peticiones a servicios externos.
- Cada curso tiene una portada generada a partir de su id (`course-cover.tsx`),
  así que se ve igual en todas las pantallas sin que el profesor suba imágenes.
- Tema claro y oscuro según el sistema, con interruptor.
- Los componentes de `src/components/ui` son los de shadcn, ajustados en tamaños
  y colores. Se agregan más con `pnpm dlx shadcn@latest add <componente>`.

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
