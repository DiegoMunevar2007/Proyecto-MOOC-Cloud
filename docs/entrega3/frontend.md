# Verificación funcional del frontend

## Alcance y estado

Implementación React integrada con la API, sin datos simulados. La verificación local no sustituye el recorrido sobre el despliegue cloud. Estado cloud: **pendiente de despliegue autorizado y nueva imagen**.

| Rol / flujo | Ruta | Verificación prevista |
|---|---|---|
| Ambos: entrar y salir | `/ingresar`, menú de cuenta | Login real; logout revoca sesión |
| Profesor: sus cursos | `/ensenar` | Incluye borradores propios; no cursos de otro profesor |
| Profesor: crear y editar | `/ensenar`, `/ensenar/:id` | Título, descripción, módulos y unidades persistidos |
| Profesor: recursos y archivos | `/ensenar/:id/recursos/:resourceId` | Edición, PUT directo al almacenamiento, estado de escaneo/procesamiento |
| Profesor: quiz | Misma ruta de recurso | Reglas, creación y edición de preguntas; claves solo para autor |
| Profesor: publicación | `/ensenar/:id` | Validación completa y errores; publicación inmutable; aparición en catálogo |
| Estudiante: catálogo y detalle | `/`, `/cursos/:id` | Curso publicado por el profesor del recorrido |
| Estudiante: inscripción y cursos | `/cursos/:id`, `/mis-cursos` | Inscripción real y acceso al contenido |
| Estudiante: consumo | `/cursos/:id/recursos/:resourceId` | Texto, enlace/documento, imagen y HLS; no servir archivos pendientes |
| Estudiante: progreso | Recurso y `/cursos/:id` | Heartbeats reales; resumen calculado por el servidor |
| Estudiante: quiz y nota | Ruta del recurso quiz | Guardar, retomar, enviar y consultar resultado persistido |
| Autorización | API y rutas protegidas | Estudiante no crea cursos; profesor no modifica cursos ajenos |

## Resultado local del 2026-10-29

Playwright Chromium: **1 recorrido completo aprobado (13,8 s)**, con escaneo ClamAV y conversión ffmpeg reales, video sintético MP4 de 30 s, reproducción HLS, heartbeat y nota persistente. Incluye rechazos de creación de admin anónima, escalamiento de rol por estudiante y edición ajena por profesor. Capturas locales: [publicación](evidencia/local/profesor-publicacion.png), [resultado](evidencia/local/estudiante-resultado.png), [móvil 390 px](evidencia/local/estudiante-movil.png). No hay desbordamiento horizontal en la vista móvil comprobada.

El recorrido automatizado cubre lectura, video y quiz. PDF/imagen/audio, edición de preguntas existentes, expiración de intentos y recuperación de fallos requieren verificaciones adicionales; la tabla no implica cobertura automática de todas las variantes. Las cargas de reemplazo quedan fuera del flujo soportado: agregar un recurso nuevo para otro archivo, según [deuda técnica](deuda-tecnica.md).

## Prueba automatizada de navegador

[connected-flow.spec.ts](../../frontend/e2e/connected-flow.spec.ts) prepara únicamente las cuentas mediante API; crea curso, módulo, unidad, lectura, video y quiz desde la interfaz. Publica como profesor, cierra sesión, se inscribe como estudiante, consume y envía el quiz; recarga para comprobar la nota persistida. También realiza peticiones negativas para permisos. No usar capturas como sustituto de los resultados de esta prueba.

```bash
# Desarrollo (preserva volúmenes existentes; .env local según .env.example)
docker compose -p mooc-local -f docker-compose.yml -f compose.dev.yml up -d --build
cd frontend
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
# Los MP4 de Git LFS deben estar descargados (git lfs pull).
# Alternativa: E2E_VIDEO_PATH con un MP4 sintético real de 30 s.
cd ..
python3 scripts/test_browser.py
```

Para cloud, usar `E2E_BASE_URL=https://<dominio>`, `E2E_ADMIN_USER` y `E2E_ADMIN_PASSWORD` del canal privado. El test crea cuentas y contenido de prueba: ejecutar solamente en el entorno de laboratorio. No guardar secretos ni traces con credenciales en el repositorio o en artefactos públicos. `E2E_MEDIA=false` permite diagnosticar los flujos académicos sin worker, pero **no acredita el recorrido completo**.

Guardar tras la ejecución cloud: commit e image_tag, URL, fecha UTC, salida de la prueba y capturas de publicación, procesamiento, consumo y nota. Revisar los artefactos antes de compartirlos: traces de red pueden contener tokens y URLs firmadas.

## Estados y decisiones

Controles deshabilitados durante mutaciones; mensajes de errores del servidor; carga y vacíos; consulta del procesamiento cada 5 s; archivos pendientes bloqueados en API y pantalla. El alumno recibe reglas e intentos propios del quiz sin las respuestas correctas. La UI permite editar borradores; la versión publicada conserva su inmutabilidad.

No forman parte del mínimo exigido: panel administrativo, recuperación de contraseña ni analítica avanzada. No confundir su ausencia con deuda técnica sin identificar un compromiso concreto.
