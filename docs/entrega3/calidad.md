# Calidad y reproducción de SonarQube

No hay un proyecto SonarCloud/SonarQube conectado al repositorio. La configuración queda lista para GitHub Actions sin contratar servicios ni guardar tokens: el job `quality` levanta SonarQube Community dentro del runner, cambia la contraseña inicial, genera una credencial efímera, analiza y exporta el resultado antes de retirar el servidor. No aprovisiona GCP. El historial persistente son los artefactos de Actions, no la base de datos efímera.

## Ejecutar y conservar

1. Subir el commit a la rama del PR y abrir **Actions → Verificación entrega 3**. Se ejecuta con push, pull request o Run workflow.
2. Verificar `backend`, `frontend`, `browser`, `terraform` y `quality`. Las pruebas Terraform usan mocks: no crean infraestructura.
3. Descargar `quality-<SHA>` y comprobar `manifest.json`: commit exacto, `dirty=false`, URL de ejecución y analysis ID. Para el cierre ejecutar sobre el commit definitivo; un diagnóstico local con cambios sin commit no es evidencia final.
4. Conservar el ZIP completo en la entrega antes de sus 90 días de retención y enlazar el run en [cierre.md](cierre.md). No copiar `.scannerwork`, credenciales temporales, traces de navegador ni datasets de sesiones.
5. Actualizar [deuda-tecnica.md](deuda-tecnica.md) con las métricas y todos los hallazgos abiertos Major o superiores. Ningún Critical/Blocker puede quedar sin corrección o plan con responsable y fecha.

El job comprueba **métricas totales**: duplicación ≤20%, mantenibilidad A/B/C, deuda disponible y código Go/TypeScript realmente analizado. El Quality Gate estándar de Sonar se exporta por separado; no confundir su evaluación de cobertura/código nuevo con los umbrales específicos del enunciado. La cobertura es informativa, nunca se elimina código del análisis para mejorar cifras.

## Archivos auditables

| Archivo | Contenido |
|---|---|
| `manifest.json`, `task.json` | Revisión, fecha, pipeline y análisis exacto |
| `measures.json`, `summary.txt` | Líneas, lenguajes, duplicación, rating, deuda en minutos, cobertura |
| `issues.json` | Hallazgos completos paginados, reglas, severidades y ubicaciones |
| `hotspots.json` | Revisión de seguridad pendiente, separada de vulnerabilidades confirmadas |
| `profiles.json`, `gate.json` | Perfiles activos y estado del gate |
| `images.json`, `server.log` | Versiones/digests y diagnóstico del servidor |

El alcance de [sonar-project.properties](../../sonar-project.properties) incluye API, worker y todo `frontend/src`. Solo separa pruebas de fuentes. El reporte Go se genera con `go test -race -coverprofile=coverage.out ./...`, incluyendo PostgreSQL y Redis reales de CI.

## Ejecución local opcional

Requiere Docker con memoria suficiente; evitar ejecutar Sonar, ClamAV y compilaciones simultáneamente en una VM Docker pequeña. El workflow contiene la receta completa. En macOS usar red Docker compartida para conectar scanner y servidor; `--network host` del workflow está pensado para el runner Linux. Para worktrees con `.git` fuera del montaje, solo en el diagnóstico local se pueden usar `-Dsonar.scm.disabled=true -Dsonar.scm.exclusions.disabled=true`; registrar el SHA y `dirty` conserva la distinción con CI.

Una instalación persistente futura es opcional: crear proyecto, asignar URL/key y almacenar el token como secret de Actions. Reemplazar únicamente bootstrap/retirada por esa conexión, preservando el análisis y la exportación. No incluir el token en archivos versionados. Referencia: [Web API de SonarQube](https://docs.sonarsource.com/sonarqube-server/extension-guide/web-api/).
