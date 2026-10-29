# Deuda técnica y calidad — Entrega 3

## Estado de la medición

El diagnóstico local inicial del 2026-10-29 analizó API, worker y frontend con SonarQube Community 26.10.0.133078: 9.655 líneas, duplicación 0,5%, mantenibilidad A, deuda Sonar 0 minutos y cobertura 5,7%. Se ejecutó sobre cambios sin commit encima de `652591e`: **no acredita la revisión final ni una ejecución GitHub Actions**. El valor de deuda de Sonar no representa todo el trabajo pendiente del proyecto.

El inventario inicial tuvo 3 hallazgos (1 Major y 2 Minor). Se corrigieron en código: rechazo de promesa sin capturar en Mis cursos y ejecución como root por defecto en imágenes de API/worker. **La segunda medición local** analizó 10.952 líneas: duplicación 0,5%, mantenibilidad A, deuda 0 minutos y cobertura 5,5%; 0 bugs/vulnerabilidades/code smells abiertos y 0 hotspots. Los tres hallazgos iniciales aparecen CLOSED. [Reporte completo local](evidencia/local/sonar/manifest.json) y archivos adyacentes (diagnóstico, `dirty=true`); la evidencia definitiva será el artefacto `quality-<SHA>` del pipeline del commit de entrega.

| Hallazgo inicial | Ubicación | Severidad Sonar | Acción |
|---|---|---|---|
| `typescript:S9383` | `frontend/src/pages/mis-cursos.tsx` | Major | Capturar error y comunicarlo; evitar modificar el array original al ordenar |
| `docker:S6471` | `backend/Dockerfile` | Minor | Usuario sin privilegios en etapa de ejecución |
| `docker:S6471` | `backend/worker/Dockerfile` | Minor | Usuario sin privilegios; temporales bajo /tmp |

**Inventario Major+ abierto del SHA final: pendiente de ejecutar Actions y revisar `issues.json`.** No trasladar el inventario inicial como si fuera el final. Incluir para cada hallazgo: regla, severidad, componente/línea, efecto, disposición, responsable y fecha. Los security hotspots requieren revisión humana y no equivalen automáticamente a vulnerabilidades confirmadas. Conservarlos completos en el reporte.

## Compromisos técnicos identificados fuera de Sonar

Responsable de seguimiento propuesto para estos puntos: Wyo Hann Chu; acordar distribución con Diego al revisar el PR. Fechas objetivo de revisión: 2026-10-30 o antes de la demo si ocurre antes. Los cambios de arquitectura requieren aprobación del usuario.

| Compromiso | Efecto / riesgo | Plan concreto y condición de cierre | Prioridad |
|---|---|---|---|
| Cola/ClamAV y DB zonal sin HA | Falla compartida afecta los dos grupos; escalar workers no repara Redis | Documentar alcance de laboratorio; medir recuperación. Proponer HA solo con costo y aprobación | Alta |
| HLS público, URL de objeto como control práctico | URL compartida permite consumo fuera de autorización API | Evaluar entrega privada/firmada para manifiestos y segmentos, con prueba de acceso no inscrito; requiere decisión de diseño | Alta |
| Carga autorizada antes de terminar PUT | Worker puede intentar leer un objeto todavía ausente; el backoff aumenta disponibilidad | Medir time-to-available; diseñar confirmación de carga/outbox y reintento con verificación de objeto | Alta |
| Reemplazo de archivo / tareas antiguas | TaskID estable y actualizaciones por recurso pueden interferir con una segunda carga | Añadir identidad por generación, rechazo de claves ajenas y actualizaciones condicionales; prueba de dos cargas concurrentes y retry | Alta; pendiente antes de habilitar reemplazos como flujo soportado |
| Vista pública del árbol con contenido | El árbol de curso publicado expone campos y puede preferir un borrador posterior | Separar catálogo de contenido autorizado y seleccionar versión vigente para estudiantes; pruebas de usuario anónimo/no inscrito | Alta |
| Margen de conexiones durante rolling update | Presupuesto de 24/25 corresponde al máximo estable, no al surge | Medir y presupuestar conexiones de la instancia temporal antes de actualizar con ambos MIG al máximo | Alta |
| Cobertura automática baja | Ramas de error y concurrencia pueden fallar pese a build/escáner verdes | Priorizar integración de autorización, reintentos, doble entrega y progreso; conservar cobertura real y no excluir código | Media |
| Token en localStorage | Un XSS podría robar sesión | Mantener renderizado de texto seguro, revisar enlaces/dependencias y evaluar cookies HttpOnly con CSRF en una evolución | Media |
| JavaScript de interfaz/HLS grande | Mayor descarga inicial en redes lentas | HLS cargado de forma diferida en ruta de consumo; medir y dividir más según uso real | Media |

## Correcciones funcionales de esta revisión

Propiedad del autor en edición/carga/validación; quiz publicable con preguntas reales; lookup autorizado del quiz y sus intentos; respuesta no marcada no cuenta como opción cero correcta; clave idempotente de intento consultada con identidad de estudiante; bloqueo de archivos no escaneados/disponibles; registro público sin asignación de rol admin; aprovisionamiento administrativo por stdin del operador.

La matriz no es un análisis de seguridad exhaustivo. Antes de cerrar, contrastar estos compromisos con los resultados de carga y agregar defectos observados con evidencia y fecha. No usar una calificación A para declarar que no existen riesgos arquitectónicos.

## Acta final por completar

| Campo | Valor |
|---|---|
| SHA / tag final | Pendiente |
| URL pipeline | Pendiente |
| Reporte completo, servidor/scanner y perfiles | Pendiente |
| Duplicación total (≤20%) | Pendiente |
| Mantenibilidad (A/B/C) | Pendiente |
| Deuda Sonar, minutos y conversión a horas/días | Pendiente |
| Major / Critical / Blocker abiertos, responsables y plazos | Pendiente |
| Revisión de hotspots | Pendiente |

Procedimiento reproducible: [calidad.md](calidad.md).
