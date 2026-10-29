# Validación local — 2026-10-29

Base de código: `652591e65fc20f084d5b606a82dba7c6db3183a9` más cambios de esta revisión, sin commit en el momento de las mediciones. No es evidencia de despliegue cloud.

- Go: `go test -race -coverprofile=coverage.out ./...` aprobado con PostgreSQL y Redis locales; integración de autoría y migración concurrente incluida.
- Frontend: TypeScript y build Vite aprobados. Advertencia de chunks >500 kB registrada como deuda; HLS se carga en ruta diferida.
- Playwright Chromium: 1 recorrido completo aprobado en 13,8 s, también vista móvil 390×844; capturas en este directorio.
- Terraform: formato y validate aprobados; 17 tests con mocks aprobados. Ningún apply ejecutado.
- k6: `inspect` de 3A, 3B y seed de identidad aprobado; no representa una corrida de carga.
- GitHub Actions: sintaxis revisada con actionlint. Ejecución remota pendiente.
- Python: compilación aprobada; gráfica comprobada con fixture sintético fuera del repo y reconciliación comprobada con un recurso real local (acepta ready; rechaza objeto distinto). Observación y reconciliación cloud pendientes de despliegue autorizado.

El MP4 local se generó con ffmpeg: los archivos del checkout eran punteros Git LFS. Se comprobó que el escaneo y transcode terminan clean/ready con el MP4 real. Fallos previos de ClamAV por memoria local y del medio LFS no se presentan como evidencia de rendimiento cloud.
