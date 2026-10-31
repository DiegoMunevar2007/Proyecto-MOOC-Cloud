# Costos — Entrega 3

Estimación a precios de lista USD en us-central1, consultados el 2026-10-29. Mes de referencia de 730 horas; día de 24 horas. Sin descuentos, créditos, impuestos ni loadgen. **No es gasto observado ni una cotización completa.** Los importes variables se suman aparte.

## Base fija: mínimo y máximo configurados

| Componente | Cantidad mínima / máxima | Tarifa | USD/h mínimo | USD/h máximo |
|---|---:|---:|---:|---:|
| API + workers e2-small | 2 / 6 | 0,016752855 por VM-h | 0,033506 | 0,100517 |
| Frontend e2-small | 1 / 1 | 0,016752855 por VM-h | 0,016753 | 0,016753 |
| Cola/ClamAV e2-medium | 1 / 1 | 0,033505710 por VM-h | 0,033506 | 0,033506 |
| Discos VM pd-balanced 30 GiB | 120 / 240 GiB | 0,000136986 por GiB-h | 0,016438 | 0,032877 |
| Cloud SQL db-f1-micro zonal | 1 / 1 | 0,0105 por h | 0,010500 | 0,010500 |
| Cloud SQL SSD 20 GiB | 20 / 20 GiB | 0,000232877 por GiB-h | 0,004658 | 0,004658 |
| LB global, primeras 5 reglas (usa 2) | 1 tramo | 0,025 por h | 0,025000 | 0,025000 |
| Cloud NAT, VM asignadas | 4 / 8 | 0,0014 por VM-h | 0,005600 | 0,011200 |
| IP externa de NAT | 1 / 1 | 0,005 por h | 0,005000 | 0,005000 |
| **Subtotal fijo/h** | | | **0,150960** | **0,240010** |
| **Subtotal fijo/día** | | | **3,62** | **5,76** |
| **Subtotal fijo/730 h** | | | **110,20** | **175,21** |

Fuentes: [VM E2](https://cloud.google.com/products/compute/pricing/general-purpose?hl=en), [Persistent Disk](https://cloud.google.com/compute/disks-image-pricing), [Cloud SQL](https://cloud.google.com/sql/pricing?hl=en), [Load Balancing](https://cloud.google.com/load-balancing/pricing), [Cloud NAT](https://cloud.google.com/nat/pricing). Revalidar región y configuración antes de desplegar. Se supone una IP NAT y que las cuatro/ocho VM tienen asignación NAT; corroborar la asignación real. Los reemplazos durante rolling update pueden añadir instancias transitorias sobre el máximo estable de los MIG.

Fórmula reproducible para n API y n workers:

`USD/h = (2n+1)×0,016752855 + 0,033505710 + (2n+2)×30×0,000136986 + 0,0105 + 20×0,000232877 + 0,025 + (2n+2)×0,0014 + 0,005`.

El costo real de una corrida elástica se integra por tiempo en cada tamaño; no se multiplica toda la corrida por el máximo si solo se alcanzó durante parte de ella.

## Consumo variable y otros conceptos

| Concepto | Qué medir / contabilizar |
|---|---|
| Tráfico LB | GiB procesados de entrada/salida; tarifa regional aplicable (referencia us-central1: 0,008 USD/GiB) |
| NAT | GiB procesados, referencia 0,045 USD/GiB; adicional al cargo fijo |
| GCS | GiB-mes de originales, HLS y contenido público; clases de operaciones y egreso por destino |
| Artifact Registry | GiB-mes de todas las imágenes y etiquetas conservadas, no solo la activa |
| Cloud SQL | Backups usados, crecimiento automático de disco, red y operaciones adicionales aplicables |
| Monitoring/Logging | Volumen/muestras facturables, ingestión y retención; validar franquicias vigentes de la cuenta |
| Secret Manager | Versiones activas y accesos; validar franquicias compartidas de la cuenta |
| Generador de carga | Si se autoriza: tipo, horas, disco y posible tráfico/NAT adicionales |
| IPs y recursos residuales | Dirección reservada sin uso, discos o snapshots persistentes, otros recursos del proyecto |

Referencias para completar según consumo: [Storage](https://cloud.google.com/storage/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [Observability](https://cloud.google.com/stackdriver/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing), [red/IP](https://cloud.google.com/vpc/network-pricing).

## Gasto real de laboratorio — pendiente

Exportar Cloud Billing filtrado por proyecto y ventana UTC de las corridas, con servicio/SKU, costo bruto, descuentos/créditos y neto. Esperar la latencia del reporte. Guardar el CSV/captura sin información de pago ni datos personales y explicar qué parte pertenece a preparación, pruebas e inactividad.

| Ventana UTC | Corridas | Horas por tamaño | Estimado fijo | Gasto bruto observado | Créditos/neto | Diferencia explicada |
|---|---|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

Conservar evidencia del inventario final. El autoscaling tiene mínimo 1 y no representa un apagado. Cloud SQL, LB, NAT y discos pueden seguir generando cargos mientras existan. Ninguna operación de retiro se ejecuta automáticamente: requiere la instrucción explícita del usuario.
